import {
  InboundMessages, sequelize, WorkflowHdr, WorkflowNew, Interaction, User, BusinessUnit, Role, WorkflowTxn, Connection, Plan, BusinessEntity
} from '../model'
import { ResponseHelper } from '../utils'
import { whatsapp, tibco } from 'config'
import { logger } from '../config/logger'
import { createChat } from './whatsapp-sender'
import { assignWFToEntity, continueChatWFExecution, processWhatsAppStartStep } from '../jobs/workflow-engine'
import { defaultMessage } from '../utils/constant'
import { isEmpty } from 'lodash'
import { Op, QueryTypes } from 'sequelize'
const { uuid } = require('uuidv4');
const got = require('got')

export class WhatsappService {
  constructor() {
    this.responseHelper = new ResponseHelper()
  }

  async fbGet(req, res) {
    logger.info('Verify webhook token')
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode && token) {
      if (mode === 'subscribe' && token === whatsapp.FB_VERIFY_TOKEN) {
        logger.info('Successfully Verified Webhook')
        res.status(200).send(challenge)
      } else {
        res.sendStatus(403)
      }
    }
  }

  async fbPost(req, res) {
    logger.info('Connection whatsapp user')
    const body = req.body
    const entries = body.entry
    if (Array.isArray(entries) && !isEmpty(entries)) {
      for (const entry of entries) {
        if (Array.isArray(entry.changes) && !isEmpty(entry.changes)) {
          for (const change of entry.changes) {
            const value = change.value
            if (value != null) {
              const phoneNumberId = value.metadata.phone_number_id
              const phoneNumber = value.metadata.display_phone_number
              const productType = body.messaging_product
              if (Array.isArray(value.messages) && !isEmpty(value.messages) && value.messages != null) {
                for (const message of value.messages) {
                  message.productType = productType || ''
                  message.phoneNumber = phoneNumber || ''
                  workflowExecute(message, phoneNumberId, message.from, 'WHATSAPP-I-HUB')
                }
              }
            }
          }
        }
      }
    }
    logger.info('Successfully process the request')
    res.status(200).send()
  }

  async whatsAppWorkflow(req, res) {
    try {
      logger.debug('Creating Whats-App')
      const { mobileNumber, msg, source } = req.body
      if (!mobileNumber || mobileNumber === '' || mobileNumber == null) {
        return this.responseHelper.onSuccess(res, 'Mobile Number is required')
      }
      const response = await this.startWorkFlow(mobileNumber, msg, source)
      return this.responseHelper.onSuccess(res, response)
    } catch (error) {
      logger.error(error, 'Error while creating whatsApp user')
      return this.responseHelper.onError(res, new Error('Error while creating whatsApp user'))
    }
  }

  async startWorkFlow(mobileNumber, msg, source) {
    logger.info('Executing the whatsApp workflow ')
    try {
      const workflowHrdx = await WorkflowHdr.findAll({ // checking whether workflow execution is done or not
        where: {
          [Op.and]: [{ entity: source }, { entityId: mobileNumber }, { wfStatus: 'DONE' }]
        }
      })
      if (Array.isArray(workflowHrdx) && workflowHrdx.length > 0) { // Reseting the workflow hdr table
        const t = await sequelize.transaction()
        try {
          for (const wfHdr of workflowHrdx) {
            await WorkflowHdr.update({ wfStatus: 'CREATED', nextActivityId: '', wfContext: {} }, { where: { entityId: mobileNumber, entity: source }, transaction: t })
          }
          await t.commit()
        } catch (err) {
          logger.error(err, 'Error while updating hdr table')
        } finally {
          if (t && !t.finished) {
            await t.rollback()
          }
        }
      }
      const workflowCount = await WorkflowHdr.count({ // we are checking workflow already assigned or not
        where: {
          [Op.and]: [{ entityId: mobileNumber }, { entity: source }]
        }
      })
      if (workflowCount === 0) {
        await assignWFToEntity(mobileNumber, source, '10')
      }
      logger.info('Source->', source)
      const workflowHrd = await WorkflowHdr.findAll({
        where: {
          [Op.and]: [{ entityId: mobileNumber }, { entity: source }],
          [Op.or]: [{ wfStatus: 'CREATED' }, { wfStatus: 'USER_WAIT' }, { wfStatus: 'SYS_WAIT' }]
        }
      })
      // console.log('workflowHrd==>', workflowHrd)
      if (Array.isArray(workflowHrd) && workflowHrd.length > 0) {
        for (const wfHdr of workflowHrd) {
          // Finding the wfJSON for current wfHdr id
          const wfDfn = await WorkflowNew.findOne({ where: { workflowId: wfHdr.wfDefnId } })
          // Finding WFJSON have definitions and process or not
          if (wfDfn?.wfDefinition && wfDfn?.wfDefinition?.definitions && wfDfn?.wfDefinition?.definitions?.process) {
            if (wfHdr.wfStatus === 'CREATED') {
              logger.info('wfHdr.nextActivityId:', wfHdr.nextActivityId)
              if (!wfHdr.nextActivityId) {
                logger.info('Process whatsapp start step')
                // Performing start step for new record
                await processWhatsAppStartStep(wfHdr, wfDfn.wfDefinition, source)
                logger.info('Processing start workflow after process start step')
                return await this.startWorkFlow(mobileNumber, msg, source)
              } else if (wfHdr.nextActivityId) {
                logger.info('Process continue workflow execution', wfHdr.nextActivityId)
                // If already wf started and continuing remaining tasks
                return await continueChatWFExecution(wfDfn.wfDefinition, wfHdr.nextActivityId, wfHdr.wfContext, mobileNumber, msg)
              }
            }
          } else {
            logger.debug('Workflow JSON not found in workflow definition table')
            return 'Please wait for allocation'
          }
        }
      } else {
        logger.debug('No records to execute the workflow hdr01')
        return 'Please wait for allocation'
      }
    } catch (err) {
      logger.debug(err, 'No records to execute the workflow hdr02')
    }
  }

  async inboundMsg(req, res) {
    try {
      logger.debug('Getting Inbound msges')
      const { waId } = req.body
      if (!waId) {
        res.json({ statusCode: 'FAILED' })
      }
      const inboundMsgData = await InboundMessages.findOne({
        attributes: ['body', 'profile_name'],
        where: { waId: waId, status: { [Op.ne]: 'CLOSED' }, smsStatus: 'received' },
        order: [
          ['inboundId', 'DESC']
        ]
      })
      logger.debug('Successfully fetch inbound msg data')
      if (inboundMsgData) {
        res.json(inboundMsgData)
      } else {
        logger.debug(defaultMessage.NOT_FOUND)
        res.json({ statusCode: 'FAILED' })
      }
    } catch (error) {
      logger.error(error, 'Error while fetching inbound msg data')
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while fetching inbound msg data'
          }
        })
      // return this.responseHelper.onError(res, new Error('Error while fetching inbound msg data'))
    }
  }

  async validateUser(req, res) {
    try {
      logger.debug('Validating User')
      const { whatsappNumber } = req.body
      if (!whatsappNumber) {
        res.json({ status: 'FAILED' })
      }
      const user = await User.findOne({
        attributes: ['userId', [sequelize.literal("title || '. ' || first_name || ' ' || last_name"), 'full_name'], 'mappingPayload'],
        where: { contactNo: whatsappNumber, status: 'ACTIVE' }
      })
      if (!user) {
        logger.debug(defaultMessage.NOT_FOUND)
        res.json({ status: 'FAILED' });
        return;
      }
      const response = []
      if (user && user.mappingPayload && Array.isArray(user.mappingPayload.userDeptRoleMapping)) {
        for (const role of user.mappingPayload.userDeptRoleMapping) {
          const roles = await Role.findAll({
            attributes: ['roleId', 'roleName', 'roleDesc'],
            where: {
              roleId: role.roleId
            }
          })
          const department = await BusinessUnit.findOne({
            attributes: ['unitId', 'unitName', 'unitDesc', 'unitType'],
            where: {
              unitId: role.unitId
            }
          })
          if (department) {
            const unitId = department.unitId
            const unitName = department.unitName
            const unitType = department.unitType
            const unitDesc = department.unitDesc
            response.push({ unitId, unitName, unitType, unitDesc, roles })
          }
        }
      }
      let flag = 'FAILED';
      const consumerSalesDeptRoles = response.filter((ele) => (ele?.unitName === 'CONSUMER-SALES'));
      if (consumerSalesDeptRoles && consumerSalesDeptRoles?.length > 0) {
        const data = consumerSalesDeptRoles[0].roles;
        for (let i = 0; i < data.length; i++) {
          console.log('data[i].roleName---->', data[i].roleName)
          if (data[i].roleName === 'C.S.O') {
            flag = 'SUCCESS';
            break;
          }
        }
      }
      if (flag === 'FAILED') {
        const cemDeptRoles = response.filter((ele) => (ele?.unitName === 'CEM'));
        if (cemDeptRoles && cemDeptRoles?.length > 0) {
          const data = cemDeptRoles[0].roles;
          for (let i = 0; i < data.length; i++) {
            console.log('data[i].roleName---->', data[i].roleName)
            if (data[i].roleName === 'CEMHEAD') {
              flag = 'SUCCESS';
              break;
            }
          }
        }
      }
      res.json({ user, status: flag })
    } catch (error) {
      logger.error(error, 'Error while validating the user')
      return res.json({
        status: 'ERROR',
        message: 'Error while validating the user'
      })
    }
  }

  async validateAccessNumber(req, res) {
    try {
      logger.debug('Getting realtime data')
      const { accessNumber } = req.body
      const reqBody = {
        accessNumber: accessNumber.length == 10 ? accessNumber.substring(3) : accessNumber
      }
      console.log('accessNumber----->', accessNumber)
      console.log('url----->', tibco.customerStatusAPIEndPoint + tibco.customerStatusAPI)
      const response = await got.put({
        headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
        url: tibco.customerStatusAPIEndPoint + tibco.customerStatusAPI,
        body: JSON.stringify(reqBody),
        retry: 0
      })
      logger.debug('Successfully fetched realtime data')
      const responeData = JSON.parse(response.body);
      if (responeData && responeData?.status && responeData?.status !== 'RE') {
        res.json({ statusCode: 'SUCCESS' })
      }
    } catch (error) {
      logger.error(error, 'Error while fetching realtime data')
      return res.json(
        {
          data: {
            status: 'FAILED',
            message: 'Error while fetching realtime data'
          }
        })
    }
  }

  async getCustomerSummary(req, res) {
    try {
      logger.debug('Getting realtime data');
      if (!req?.body?.accessNumber) {
        return res.json(
          {
            status: 'FAILED',
            message: defaultMessage.MANDATORY_FIELDS_MISSING
          })
      }
      const { accessNumber } = req?.body;
      const workflowHdrData = await Connection.findOne({
        attributes: ['mappingPayload'],
        where: {
          identificationNo: accessNumber
        },
        raw: true
      });
      if (!workflowHdrData) {
        return res.json(
          {
            status: 'FAILED'
          })
      }
      const planData = await Plan.findOne({
        attributes: ['prodType'],
        where: {
          planId: workflowHdrData?.mappingPayload?.plans[0]?.planId
        },
        raw: true
      });

      const reqBody = {
        accessNumber,
        identifier: planData?.prodType === 'Fixed' ? 'FIXEDLINE' : 'MOBILE',
        trackingId: uuid()
      }
      const response = await got.put({
        headers: { Authorization: 'Basic ' + Buffer.from('Aios' + ':' + '$Tibc0@Aios$').toString('base64') },
        url: tibco?.customerAPIEndPoint + tibco?.customerSummaryAPI,
        body: JSON.stringify(reqBody),
        retry: 0
      })
      logger.debug('Successfully fetched realtime data');
      if (!response || !response?.body) {
        logger.debug(defaultMessage.NOT_FOUND)
        return res.json(
          {
            status: 'FAILED',
            message: defaultMessage.NOT_FOUND
          })
      }
      const responseData = JSON.parse(response.body);

      if (responseData && responseData?.customerSummary?.status?.code?.includes('ERROR') && responseData?.serviceStatus?.mobile?.code?.includes('ERROR') && responseData?.statusCode?.includes('ERROR')) {
        responseData.status = 'ERROR'
        return res.json(responseData)
      } else if (responseData && responseData?.serviceStatus && 'fixedLine' in responseData?.serviceStatus && responseData?.serviceStatus?.fixedLine?.message === 'SearchNumber is success') {
        responseData.status = 'SUCCESS'
      } else if ('mobile' in responseData?.serviceStatus && responseData?.serviceStatus?.mobile?.code?.includes('SUCCESS')) {
        responseData.status = 'SUCCESS'
      } else {
        responseData.status = 'FAILED'
      }
      return res.json(responseData)
    } catch (error) {
      logger.error(error, 'Error while fetching realtime data')
      return res.json(
        {
          status: 'ERROR'
        })
    }
  }

  async getCustomerSummaryFixedline(req, res) {
    try {
      logger.debug('Getting realtime data');
      if (!req?.body?.accessNumber) {
        return res.json(
          {
            status: 'FAILED',
            message: defaultMessage.MANDATORY_FIELDS_MISSING
          })
      }
      const { accessNumber } = req?.body;
      const reqBody = {
        accessNumber,
        identifier: 'FIXEDLINE',//'MOBILE'
        trackingId: uuid()
      }
      const response = await got.put({
        headers: { Authorization: 'Basic ' + Buffer.from('Aios' + ':' + '$Tibc0@Aios$').toString('base64') },
        url: tibco?.customerAPIEndPoint + tibco?.customerSummaryAPI,
        body: JSON.stringify(reqBody),
        retry: 0
      })
      logger.debug('Successfully fetched realtime data');
      if (!response || !response?.body) {
        logger.debug(defaultMessage.NOT_FOUND)
        return res.json(
          {
            status: 'FAILED',
            message: defaultMessage.NOT_FOUND
          })
      }
      const responseData = JSON.parse(response.body);
      if (responseData && responseData?.customerSummary?.status?.code?.includes('ERROR') && responseData?.serviceStatus?.fixedLine?.code?.includes('ERROR') && responseData?.statusCode?.includes('ERROR')) {
        responseData.status = 'ERROR'
        return res.json(responseData)
      } else if (responseData && responseData?.serviceStatus?.fixedLine?.message === 'No Service Number is found') {
        responseData.status = 'FAILED'
        return res.json(responseData)
      } else if (responseData && responseData?.serviceStatus && 'fixedLine' in responseData?.serviceStatus && responseData?.serviceStatus?.fixedLine?.message === 'SearchNumber is success') {
        responseData.status = 'SUCCESS'
      } else {
        responseData.status = 'FAILED'
      }
      return res.json(responseData)
    } catch (error) {
      logger.error(error, 'Error while fetching fixedline realtime data')
      return res.json(
        {
          status: 'ERROR'
        })
    }
  }

  async getCustomerSummaryMobile(req, res) {
    try {
      logger.debug('Getting realtime data');
      if (!req?.body?.accessNumber) {
        return res.json(
          {
            status: 'FAILED',
            message: defaultMessage.MANDATORY_FIELDS_MISSING
          })
      }
      const { accessNumber } = req?.body;
      const reqBody = {
        accessNumber,
        identifier: 'MOBILE',
        trackingId: uuid()
      }
      const response = await got.put({
        headers: { Authorization: 'Basic ' + Buffer.from('Aios' + ':' + '$Tibc0@Aios$').toString('base64') },
        url: tibco?.customerAPIEndPoint + tibco?.customerSummaryAPI,
        body: JSON.stringify(reqBody),
        retry: 0
      })
      logger.debug('Successfully fetched mobile realtime data');
      if (!response || !response?.body) {
        logger.debug(defaultMessage.NOT_FOUND)
        return res.json({
          status: 'FAILED',
          message: defaultMessage.NOT_FOUND
        })
      }
      const responseData = JSON.parse(response.body);
      if (responseData && responseData?.customerSummary?.status?.code?.includes('ERROR') && responseData?.serviceStatus?.mobile?.code?.includes('ERROR') && responseData?.statusCode?.includes('ERROR')) {
        responseData.status = 'ERROR'
        return res.json(responseData)
      } else if (responseData && responseData?.serviceStatus?.mobile?.message === "Subscriber doesn't exist") {
        responseData.status = 'FAILED'
        return res.json(responseData)
      } else if (responseData && responseData?.serviceStatus && 'mobile' in responseData?.serviceStatus && responseData?.serviceStatus?.mobile && responseData?.serviceStatus?.mobile?.subscriberType && (responseData?.serviceStatus?.mobile?.subscriberType === 'PREPAID' || responseData?.serviceStatus?.mobile?.subscriberType === 'POSTPAID')) {
        responseData.status = 'SUCCESS'
      } else {
        responseData.status = 'FAILED'
      }
      return res.json(responseData)
    } catch (error) {
      logger.error(error, 'Error while fetching mobile realtime data')
      return res.json(
        {
          status: 'ERROR'
        })
    }
  }

  async getContractDetails(req, res) {
    try {
      logger.debug('Creating Whats-App')
      const { accessNumber } = req.body

      const response = await got.get({
        headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
        url: tibco.contractDetailsAPIEndPoint + tibco.contractDetailsAPI + '?accessno=' + accessNumber,
        retry: 0
      })
      logger.debug('Successfully fetched realtime data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, JSON.parse(response.body))
    } catch (error) {
      logger.error(error, 'Error while creating whatsApp user')
      return this.responseHelper.onError(res, new Error('Error while creating whatsApp user'))
    }
  }

  async getOpenTickets(req, res) {
    try {
      logger.debug('Fetching open tickets')
      const { accessNumber } = req.body
      let status;
      const openTickets = await Interaction.findAll({
        include: [
          {
            model: BusinessEntity,
            as: 'srType',
            attributes: ['description']
          },
          {
            model: BusinessEntity,
            as: 'currStatusDesc',
            attributes: ['description']
          },
          {
            model: BusinessEntity,
            as: 'inqCauseDesp',
            attributes: ['description']
          }
        ],
        where: {
          identificationNo: accessNumber,
          currStatus: {
            [Op.notIn]: ['CLOSED', 'CANCELLED']
          }
        }
      })
      if (openTickets.length > 0) {
        status = 'SUCCESS'
      } else {
        status = 'FAILED'
      }
      logger.debug('Successfully fetched open tickets data')
      res.json({
        status,
        data: openTickets
      })
    } catch (error) {
      logger.error(error, 'Error while fetching open tickets')
      res.json({
        status: 'ERROR'
      })
    }
  }

  async getActiveOffers(req, res) {
    try {
      logger.debug('Fetching active offers')
      const { accessNumber } = req.body

      const rawQuery = `select * from campaign where service_no='${accessNumber}' order by valid_from desc`

      const results = await sequelize.query(rawQuery, {
        type: QueryTypes.SELECT
      })
      let status = 'FAILED'
      if (results && results?.length > 0) {
        status = 'SUCCESS'
      }

      logger.debug('Successfully fetched active offers data')
      res.json({
        results,
        status
      })
    } catch (error) {
      logger.error(error, 'Error while fetching active offers');
      res.json({
        status: 'ERROR'
      })
    }
  }

  async contractDetails(req, res) {
    try {
      logger.debug('Fetching active offers')
      const { accessNumber } = req.body

      const response = await got.get({
        headers: { Authorization: 'Basic ' + Buffer.from(tibco.username + ':' + tibco.passwd).toString('base64') },
        url: tibco.contractDetailsAPIEndPoint + tibco.contractDetailsAPI + '?accessno=' + accessNumber,
        retry: 0
      })

      logger.debug('Successfully fetched active offers data')
      res.json({
        response: JSON.parse(response.body)
      })
    } catch (error) {
      logger.error(error, 'Error while fetching active contracts');
      res.json({
        status: 'ERROR'
      })
    }
  }
}

async function workflowExecute(message, phoneNumberId, senderID, source) {
  logger.info('Executing workflow')
  const t = await sequelize.transaction()
  try {
    // If User enters help anytime then clearing the chat and restarting
    if (message?.text?.body.toUpperCase() === 'HELP') {
      const workflowHdrData = await WorkflowHdr.findOne({
        attributes: ['wfHdrId'],
        where: {
          entityId: message?.from
        },
        raw: true
      });
      if (workflowHdrData) {
        const hdrClear = await WorkflowHdr.destroy({
          where: {
            wfHdrId: workflowHdrData?.wfHdrId
          }
        })

        if (hdrClear > 0) {
          const inboundClear = await InboundMessages.destroy({
            where: {
              waId: senderID
            },
          })

          if (inboundClear > 0) {
            await WorkflowTxn.destroy({
              where: {
                wfHdrId: workflowHdrData?.wfHdrId
              }
            })
          }
        }
        message.text.body = 'hi'
      }
    }
    // Workflow code started from here
    const body = message
    let callAgainFlag = { callAgain: false }
    const inbound = await InboundMessages.findOne({
      where: { messageFrom: senderID, status: 'in progress' },
      order: [['inbound_id', 'DESC']]
    })
    if (inbound !== null) {
      const inboundId = inbound.inboundId
      await InboundMessages.update({ status: 'closed' }, { where: { inboundId, status: 'in progress' }, transaction: t })
    }
    callAgainFlag = await createChat(body, senderID, callAgainFlag, phoneNumberId, source, t)
    while (callAgainFlag.callAgain) {
      logger.info('Calling again creat chat', callAgainFlag.callAgain)
      callAgainFlag = await createChat(body, senderID, callAgainFlag, phoneNumberId, source, t)
    }
    logger.info('Successfully Executed Workflow')
    await t.commit()
  } catch (error) {
    logger.error(error, 'Error while executing workflow')
    return false
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}
