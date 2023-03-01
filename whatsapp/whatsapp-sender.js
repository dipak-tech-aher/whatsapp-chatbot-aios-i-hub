import {
  InboundMessages, sequelize, BusinessUnit, BusinessEntity, Customer, Contact, WorkflowHdr,
  WhatsAppReport, WhatsAppChatHistory, TariffMst, TariffOfferMapping, Plan
} from '../model'
import { logger } from '../config/logger'
import { whatsapp, systemUserId, tibco } from 'config'
import jsonata from 'jsonata'
import { Op } from 'sequelize'
import { isEmpty } from 'lodash'
import moment from 'moment'

const Got = require('got')
const https = require('https')

export async function createChat(body, senderID, callAgainFlag, pageObjectId, source, tr) {
  logger.info('Creating chat record')
  let callAgain = false
  let response = {}
  response.status = 'Created'
  let sourceResponse, wfResponse

  let whatsappSessionData = await WhatsAppReport.findOne({
    where: {
      whatsappNumber: senderID,
      status: 'CREATED'
    },
    raw: true
  })

  if (!whatsappSessionData) {
    const reportData = {
      whatsappNumber: senderID,
      status: 'CREATED',
      createdBy: systemUserId
    }
    whatsappSessionData = await WhatsAppReport.create(reportData)
  }

  if (!callAgainFlag.callAgain) {
    body.smsStatus = 'received'
    response = await storeChat(body, senderID, source, whatsappSessionData.reportId)
  }
  if (response.status === 'Created') {
    let data = {
      mobileNumber: senderID,
      msg: body.type === 'text' ? body.text.body : body[body.type]?.id || '',
      source
    }
    logger.info('Initiating Whatsapp workflow')
    const workflowResponse = await Got.post({
      headers: { 'content-type': 'application/json' },
      url: 'http://localhost:4003/api/whatsapp', // whatsAppWorkflow is calling from here
      body: JSON.stringify(data),
      retry: 0
    }, {
      https: { rejectUnauthorized: false }
    })
    wfResponse = JSON.parse(workflowResponse.body)

    if (wfResponse.status === 200 && response?.inboundId) {
      let taskName = ''
      if (wfResponse?.message) {
        const key = Object.keys(wfResponse?.message)
        if (wfResponse && wfResponse?.message && key.length > 0) {
          taskName = wfResponse.message[key[0]].taskName
          if (!taskName) {
            taskName = wfResponse.message.taskName
          }
        }
      }
      await updateChat({ taskName: taskName, body }, senderID, response?.inboundId)
    }

    if (wfResponse?.message !== 'WORKFLOWEND' && wfResponse?.message === undefined) {
      callAgain = true
      return { callAgain: callAgain }
    }

    if (wfResponse?.message === 'Please enter help to go main menu') {
      sourceResponse = wfResponse?.message
    }

    if (typeof (wfResponse.message) === 'object') {
      if (wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix !== undefined) {
        const separatedStr = wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix.split('$')
        if (separatedStr[1] !== undefined) {
          const expr = '$' + separatedStr[1]
          const expression = jsonata(expr);
          const value = expression.evaluate(wfResponse?.message?.inputContext)
          const respOfWhatsapp = separatedStr[0].replace("--@#@--", value);
          sourceResponse = respOfWhatsapp
        } else {
          sourceResponse = wfResponse?.message?.executeSendMessageTaskResult?.taskContextPrefix
        }
      } else {
        sourceResponse = wfResponse?.message?.taskContextPrefix
      }
    }

    if (wfResponse?.message !== 'WORKFLOWEND') {
      const sourceResponseonse = {}
      let sendResponse
      logger.info('Source Response:', sourceResponse)
      if (sourceResponse === 'SHOW FIXEDLINE CONNECTION STATUS' || sourceResponse === 'SHOW FIXEDLINE CONNECTION STATUS_NEW') {
        let workflowHdrData = await WorkflowHdr.findOne({
          where: {
            entityId: senderID,
            wfStatus: 'CREATED'
          },
          raw: true
        });
        const expr = sourceResponse === 'SHOW FIXEDLINE CONNECTION STATUS' ? '$.context.Activity_0sv7k67.task_1.response.value.body' : '$.context.Activity_0fbw2wm.task_1.response.value.body';
        const expression = jsonata(expr);
        const value = expression.evaluate(workflowHdrData?.wfContext);

        const fixedlineConnectionResponse = await Got.post({
          headers: { 'content-type': 'application/json' },
          url: 'http://localhost:4003/api/whatsapp/get-customer-summary-fixedline',
          body: JSON.stringify({ accessNumber: value }),
          retry: 0
        }, {
          https: { rejectUnauthorized: false }
        })

        const list = JSON.parse(fixedlineConnectionResponse.body) || []

        sendResponse = await sendfixedlineConnectionStatus(pageObjectId, senderID, list, whatsappSessionData, tr)
      } else if (sourceResponse === 'SHOW MOBILE CONNECTION STATUS' || sourceResponse === 'SHOW MOBILE CONNECTION STATUS_NEW') {
        let workflowHdrData = await WorkflowHdr.findOne({
          where: {
            entityId: senderID,
            wfStatus: 'CREATED'
          },
          raw: true
        });
        const expr = sourceResponse === 'SHOW MOBILE CONNECTION STATUS' ? '$.context.Activity_0bb97d9.task_1.response.value.body' : '$.context.Activity_0hujge0.task_1.response.value.body';

        const expression = jsonata(expr);
        const value = expression.evaluate(workflowHdrData?.wfContext);

        const mobileConnectionResponse = await Got.post({
          headers: { 'content-type': 'application/json' },
          url: 'http://localhost:4003/api/whatsapp/get-customer-summary-mobile',
          body: JSON.stringify({ accessNumber: value }),
          retry: 0
        }, {
          https: { rejectUnauthorized: false }
        })

        const list = JSON.parse(mobileConnectionResponse.body) || []

        sendResponse = await sendmobileConnectionStatus(pageObjectId, senderID, list, whatsappSessionData, tr)
      }
      else if (sourceResponse === 'SHOW_OFFERS' || sourceResponse === 'SHOW OFFERS') {
        let workflowHdrData = await WorkflowHdr.findOne({
          where: {
            entityId: senderID,
            wfStatus: 'CREATED'
          },
          raw: true
        });
        const expr = sourceResponse === 'SHOW OFFERS' ? '$.context.Activity_0mq8joe.task_1.response.value.results' : '$.context.Activity_103mbxm.task_1.response.value.results';

        const accessNumberExpr = sourceResponse === 'SHOW OFFERS' ? '$.context.Activity_0jdzml8.task_1.response.value.body' : '$.context.Activity_0va8kcl.task_1.response.value.body';

        const expression = jsonata(expr);
        const accessNumberExpression = jsonata(accessNumberExpr);
        const offers = expression.evaluate(workflowHdrData?.wfContext);
        const accessNumber = accessNumberExpression.evaluate(workflowHdrData?.wfContext);

        sendResponse = await sendOffers(pageObjectId, senderID, offers, whatsappSessionData, tr, accessNumber)
      }
      else if (sourceResponse === 'SHOW OPEN TKTS' || sourceResponse === 'SHOW_OPEN_TKTS') {
        let workflowHdrData = await WorkflowHdr.findOne({
          where: {
            entityId: senderID,
            wfStatus: 'CREATED'
          },
          raw: true
        });
        const expr = sourceResponse === 'SHOW OPEN TKTS' ? '$.context.Activity_1w1htx4.task_1.response.value.data' : '$.context.Activity_1seeaqj.task_1.response.value.data';

        const accessNumberExpr = sourceResponse === 'SHOW OPEN TKTS' ? '$.context.Activity_1l6ikk1.task_1.response.value.body' : '$.context.Activity_0a4qym4.task_1.response.value.body';

        const expression = jsonata(expr);
        const accessNumberExpression = jsonata(accessNumberExpr);
        const offers = expression.evaluate(workflowHdrData?.wfContext);
        const accessNumber = accessNumberExpression.evaluate(workflowHdrData?.wfContext);

        sendResponse = await sendOpenTkts(pageObjectId, senderID, offers, whatsappSessionData, tr, accessNumber)
      }
      else if (sourceResponse === 'SHOW CONNECTION STATUS' || sourceResponse === 'SHOW_CONNECTION_STATUS') {
        let workflowHdrData = await WorkflowHdr.findOne({
          where: {
            entityId: senderID,
            wfStatus: 'CREATED'
          },
          raw: true
        });

        const expr = sourceResponse === 'SHOW CONNECTION STATUS' ? '$.context.Activity_0i9cw2u.task_1.response.value' : '$.context.Activity_0uqpib9.task_1.response.value';

        const accessNumberExpr = sourceResponse === 'SHOW CONNECTION STATUS' ? '$.context.Activity_0xjq82o.task_1.response.value.body' : '$.context.Activity_19vcgey.task_1.response.value.body';

        const expression = jsonata(expr);
        const accessNumberExpression = jsonata(accessNumberExpr);
        const offers = expression.evaluate(workflowHdrData?.wfContext);
        const accessNumber = accessNumberExpression.evaluate(workflowHdrData?.wfContext);

        sendResponse = await sendConnectionStaus(pageObjectId, senderID, offers, whatsappSessionData, tr, accessNumber)
      }
      else if (sourceResponse === 'COLLECT_INPUT') {
        sendResponse = 'Sent'
      } else {
        sendResponse = await sendWhatsappReply(pageObjectId, senderID, sourceResponse, whatsappSessionData.reportId, tr)
      }
      logger.info('Send Response:', sendResponse)
      if (sendResponse === 'Sent') {
        const body = {
          from: whatsapp.WHATSAPP_NUMBER,
          to: senderID,
          type: 'text',
          body: sourceResponse,
          smsStatus: 'sent',
          chatSource: source || '',
          payload: sourceResponseonse?.payload || {}
        }
        const resp = await storeSentChat(body)
        if (wfResponse?.status === 200) {
          let taskName = ''
          const key = Object.keys(wfResponse?.message)
          if (wfResponse && wfResponse?.message && key.length > 0) {
            taskName = wfResponse.message[key[0]].taskName
            if (!taskName) {
              taskName = wfResponse.message.taskName
            }
          }
          await updateChat({ taskName: taskName, body }, senderID, resp?.inboundId)
        }
        if (resp.status === 'Created' && typeof (wfResponse.message) === 'object') {
          if (wfResponse?.message?.executeSendMessageTaskResult?.type === 'SENDMESSAGE' || wfResponse?.message?.type === 'API') {
            callAgain = true
          }
        }
      }
    }
  }
  return { callAgain: callAgain }
}

export const storeChat = async (body, senderID, source, reportId) => {
  const t = await sequelize.transaction()
  try {
    logger.info('Creating Inbound Chat Record')
    let flag
    const data = {
      waId: senderID,
      smsStatus: 'received',
      body: body.type === 'text' ? body?.text?.body : body[body.type]?.id || '',
      messageTo: whatsapp.WHATSAPP_NUMBER,
      messageFrom: senderID,
      // createdAt: new Date(),
      status: 'in progress',
      flag: flag || '',
      chatSource: source
    }
    const resp = await InboundMessages.create(data, { transaction: t })

    const data1 = {
      reportId,
      fromMsg: senderID,
      toMsg: whatsapp.WHATSAPP_NUMBER,
      message: body.type === 'text' ? body?.text?.body : body[body.type]?.id || '',
      source: 'USER',
      createdBy: systemUserId
    }
    const resp1 = await WhatsAppChatHistory.create(data1, { transaction: t })

    let response
    if (resp && resp1) {
      response = { status: 'Created', inboundId: resp?.inboundId }
    }
    await t.commit()
    logger.debug('Successfully created chat')
    return response
  } catch (error) {
    logger.error(error, 'Error while creating chat record')
    return 'Error'
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

export const updateChat = async (body, senderID, inboundId) => {
  logger.info('Updating chat record')
  const t = await sequelize.transaction()
  try {
    const menuValue = {}
    if (!isEmpty(body?.taskName)) {
      if (body.body && body.body?.smsStatus !== 'received') {
      } else {
        const inbound = await InboundMessages.findAndCountAll({
          attributes: ['menuItem'],
          where: {
            waId: senderID,
            smsStatus: 'sent'
          },
          order: [['inbound_id', 'DESC']]
        })
        if (inbound?.count > 0) {
          menuValue.menuId = inbound.rows[0]?.dataValues?.menuItem || ''
        }
      }
    } else {
      if (body.body && body.body?.smsStatus === 'received') {
        const inbound = await InboundMessages.findAndCountAll({
          attributes: ['menuItem'],
          where: {
            waId: senderID,
            smsStatus: 'sent'
          },
          order: [['inbound_id', 'DESC']]
        })
        if (inbound?.count > 0) {
          menuValue.menuId = inbound.rows[0]?.dataValues?.menuItem || ''
        }
      }
    }
    if (inboundId !== null && inboundId !== undefined) {
      const data = { menuItem: menuValue?.menuId || '' }
      await InboundMessages.update(data, { where: { inboundId }, transaction: t })
    }
    await t.commit()
    logger.debug('Successfully Updated chat')
    return 'Updated'
  } catch (error) {
    logger.error(error, 'Error while updating Chat')
    return 'Error'
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

export const storeSentChat = async (body) => {
  const t = await sequelize.transaction()
  try {
    logger.info('Creating sent chat..problem')
    const data = {
      smsMessageSid: '',
      numMedia: '',
      profileName: '',
      waId: body.to,
      smsStatus: body.smsStatus,
      body: body.type === 'text' ? body.body : '',
      messageTo: body.to,
      messageFrom: body.from,
      accountSid: '',
      createdAt: new Date(),
      status: 'in progress',
      tableName: '',
      payload: body.payload || {},
      flag: ''
    }
    const resp = await InboundMessages.create(data, { transaction: t })
    await t.commit()
    let response
    if (resp) {
      response = { status: 'Created', inboundId: resp?.inboundId }
    }
    logger.debug('Successfully created sent chat...')
    return response
  } catch (error) {
    logger.error(error, error)
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

export const setInboundMessages = async (senderID, options) => {
  const t = await sequelize.transaction()
  try {
    const { message, payload, menuId } = options
    const data = {
      waId: senderID,
      smsStatus: 'received',
      body: message || '',
      messageTo: whatsapp.WHATSAPP_NUMBER,
      messageFrom: senderID,
      createdAt: new Date(),
      status: 'in progress',
      flag: message || '',
      payload: payload,
      menuItem: menuId
    }
    const resp = await InboundMessages.create(data, { transaction: t })
    await t.commit()
    let response
    if (resp) {
      response = { status: 'Created', inboundId: resp?.inboundId }
    }
    return response
  } catch (error) {
    logger.info(error)
    return error
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}

const sendOffers = async (pageObjectId, senderID, list, whatsappSessionData, tr, accessNumber) => {
  let t;
  let msg = `Please see the best offer(s) for the Access Number: ${accessNumber && accessNumber || 'NULL'} \n\n`
  for (let i = 0; i < list.length; i++) {
    msg = msg + `${i + 1}. Offer Name - ${list[i]?.camp_name && list[i]?.camp_name || 'NULL'}\n`
    msg = msg + `Tariff - ${list[i]?.camp_description && list[i]?.camp_description || 'NULL'}\n`
    msg = msg + `Valid From - ${list[i]?.valid_from && moment(list[i]?.valid_from).format('DD-MMM-YYYY') || 'NULL'}\n`
    msg = msg + `Valid To - ${list[i]?.valid_to && moment(list[i]?.valid_to).format('DD-MMM-YYYY') || 'NULL'}\n\n`
  }
  msg = msg + '\nType *Help* to return back to menu'
  t = await sendWhatsappReply(pageObjectId, senderID, msg, whatsappSessionData.reportId, tr)
  return t
}

const sendOpenTkts = async (pageObjectId, senderID, list, whatsappSessionData, tr, accessNumber) => {
  let t;
  let msg = ` Current status of Open tickets of Access Number: ${accessNumber} \n\n`
  for (let i = 0; i < list.length; i++) {
    msg = msg + `${i + 1}. Ticket ID - ${list[i]?.intxnId && list[i]?.intxnId || 'NULL'}\n`
    msg = msg + `Service Type - ${list[i]?.businessEntityCode && list[i]?.businessEntityCode || 'NULL'}\n`
    msg = msg + `Ticket Type - ${list[i]?.intxnType && list[i]?.srType?.description || 'NULL'}\n`
    msg = msg + `Problem Type - ${list[i]?.commentType && list[i]?.inqCauseDesp?.description || 'NULL'}\n`
    msg = msg + `Description - ${list[i]?.description && list[i]?.description.trim() || 'NULL'}\n`
    msg = msg + `Date of Creation - ${list[i]?.createdAt && moment(list[i]?.createdAt).format('DD-MMM-YYYY') || 'NULL'}\n`
    msg = msg + `Current Status - ${list[i]?.currStatus && list[i]?.currStatusDesc?.description || 'NULL'}\n\n`
  }
  msg = msg + '\nType *Help* to return back to menu'
  console.log('msg.length---->', msg.length)
  t = await sendWhatsappReply(pageObjectId, senderID, msg, whatsappSessionData.reportId, tr)
  return t
}

const sendConnectionStaus = async (pageObjectId, senderID, list, whatsappSessionData, tr, accessNumber) => {
  let t;
  let planName;
  let msg;
  try {
    const tarrifCode = list?.customerSummary?.return?.serviceSummary?.tariffCode;
    if (tarrifCode && tarrifCode !== null && tarrifCode !== "") {
      const planNameResponse = await Plan.findOne({
        attributes: ["planName"],
        where: { refPlanCode: tarrifCode }
      });
      planName = planNameResponse?.planName
    }

    const response = await Got.get({
      headers: { Authorization: 'Basic ' + Buffer.from(tibco?.username + ':' + tibco?.passwd).toString('base64') },
      url: tibco.contractDetailsAPIEndPoint + tibco.contractDetailsAPI + '?accessno=' + accessNumber,
      retry: 0
    })
    const contractDetails = JSON.parse(response.body);
    let latestMonthData;
    let outstandingAmount;
    let type;
    let unnServiceStatus;
    let mainBalance;
    let voice;
    let sms;
    let prepaidData;
    if (list && list?.serviceStatus && 'fixedLine' in list?.serviceStatus && list?.serviceStatus?.fixedLine?.message === 'SearchNumber is success') {
      const billingDetailsArr = list?.serviceStatus?.fixedLine?.billingDetails;
      let dateArray = [];
      billingDetailsArr && billingDetailsArr.forEach((ele) => {
        ele?.billDate && dateArray.push(new Date(moment(ele?.billDate.split('T')[0]).format('YYYY/MM/D')))
      });
      let maxDate = new Date(Math.max(...dateArray));
      const latestDate = moment(maxDate).format('YYYY/MM/D');
      latestMonthData = billingDetailsArr && billingDetailsArr.filter((e) => e?.billDate && moment(e.billDate.split('T')[0]).format('YYYY/MM/D') === latestDate);
      outstandingAmount = list?.serviceStatus?.fixedLine?.outstandingAmount && list?.serviceStatus?.fixedLine?.outstandingAmount
      type = 'FIXEDLINE'
      unnServiceStatus = list?.serviceStatus?.fixedLine?.status && list?.serviceStatus?.fixedLine?.status
    } else if (list && 'mobile' in list?.serviceStatus && list?.serviceStatus?.mobile?.code?.includes('SUCCESS')) {
      if (list && list?.serviceStatus?.mobile?.subscriberType === 'PREPAID') {
        type = list?.serviceStatus?.mobile?.subscriberType;

        mainBalance = list?.serviceStatus?.mobile?.prepaid?.balance && list?.serviceStatus?.mobile?.prepaid?.balance.length > 0 && list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e.balanceType === 'MainBalance') && 'BND ' + Number(list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e.balanceType === 'MainBalance')[0].value).toFixed(2) || 'NULL';

        voice = list?.serviceStatus?.mobile?.prepaid?.balance && list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e?.balanceType === 'Voice') && list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e?.balanceType === 'Voice')[0].value + ' Mins' || 'NULL';

        sms = list?.serviceStatus?.mobile?.prepaid?.balance && list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e.balanceType === 'SMS') && list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e.balanceType === 'SMS')[0].value || 'NULL';

        const dataValues = list?.serviceStatus?.mobile?.prepaid?.balance && list?.serviceStatus?.mobile?.prepaid?.balance.filter((e) => e?.balanceType === 'Data');

        if (dataValues) {
          const result = dataValues && dataValues?.reduce(function (tot, arr) {
            return tot + (+arr.value)
          }, 0);
          prepaidData = ((result / 1024) / 1024) / 1024 + ' GB';
        }
      } else {
        const billingDetailsArr = list?.serviceStatus?.mobile?.postpaid?.billingDetails;
        let dateArray = [];
        billingDetailsArr && billingDetailsArr.length > 0 && billingDetailsArr?.forEach((ele) => {
          ele?.billDate && dateArray.push(new Date(moment(ele?.billDate.split('T')[0]).format('YYYY/MM/D')))
        })
        let maxDate = new Date(Math.max(...dateArray));
        const latestDate = moment(maxDate).format('YYYY/MM/D');
        latestMonthData = billingDetailsArr && billingDetailsArr.length > 0 && billingDetailsArr.filter((e) => e?.billDate && moment(e.billDate.split('T')[0]).format('YYYY/MM/D') === latestDate);
        outstandingAmount = list?.serviceStatus?.mobile?.postpaid?.outstandingAmount && list?.serviceStatus?.mobile?.postpaid?.outstandingAmount;
        type = list?.serviceStatus?.mobile?.subscriberType
        unnServiceStatus = list?.serviceStatus?.mobile?.subscriberStatus;
      }
    }

    msg = `Customer Details of Access Number: ${accessNumber && accessNumber || 'NULL'} \n\n`
    msg = msg + `*Customer Details*\n`
    if (list?.customerSummary?.status?.code?.includes('ERROR')) {
      msg = msg + 'We are facing some technical issue. Please try again later.'
    } else {
      msg = msg + `Type - ${type || 'NULL'}\n`
      msg = msg + `Customer Name - ${list?.customerSummary && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'CustomerName') && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'CustomerName')[0]?.value?.stringValue || 'NULL'}\n`
      msg = msg + `Customer Status - ${list?.customerSummary?.return?.customerStatus && list?.customerSummary?.return?.customerStatus === 'ACTIVE' ? 'Active' : 'Inactive' || 'NULL'}\n`
      msg = msg + `Account Status - ${list?.customerSummary?.return?.accountStatus && list?.customerSummary?.return?.accountStatus === 'ACTIVE' ? 'Active' : 'Inactive' || 'NULL'}\n`
      msg = msg + `UNN Service Status - ${unnServiceStatus && (unnServiceStatus === 'ACTIVATED' || unnServiceStatus === 'ACTIVE') ? 'Active' : 'Inactive' || 'NULL'}\n`
      msg = msg + `Plan Name - ${planName && planName || 'NULL'}\n\n`
    }

    if (type === 'PREPAID') {
      msg = msg + `*Balance*\n`
      if (list?.serviceStatus?.mobile?.prepaid?.code?.includes('ERROR')) {
        msg = msg + 'We are facing some technical issue. Please try again later.'
      } else {
        msg = msg + `Main Balance - ${mainBalance && mainBalance}\n`
        msg = msg + `Voice - ${voice && voice || 'NULL'}\n`
        msg = msg + `Sms - ${sms && sms || 'NULL'}\n`
        msg = msg + `Data - ${prepaidData && prepaidData || 'NULL'}\n`
      }
    } else {
      msg = msg + `*Contract Details*\n`
      if (contractDetails?.response?.Status?.toUpperCase()?.includes('ERROR')) {
        msg = msg + 'We are facing some technical issue. Please try again later.'
      } else {
        msg = msg + `Contract name - ${contractDetails?.contractName && contractDetails?.contractName || 'NULL'}\n`
        msg = msg + `Contract Start Date - ${contractDetails?.startDate && moment(contractDetails?.startDate).format('DD-MMM-YYYY') || 'NULL'}\n`
        msg = msg + `Contract Expiry Date - ${contractDetails?.expiryDate && moment(contractDetails?.expiryDate).format('DD-MMM-YYYY') || 'NULL'}\n`
        msg = msg + `Contract Status - ${contractDetails?.statusCd && contractDetails?.statusCd || 'NULL'}\n`
        // msg = msg + `Contract Status - ${contractDetails?.Status && contractDetails?.contractName && contractDetails?.Status === 'SUCCESS' ? 'Active' : contractDetails?.Status && contractDetails?.contractName && contractDetails?.Status !== 'SUCCESS' ? 'Inactive' : 'NULL' || 'NULL'}\n`
        msg = msg + `Contract Penalty Amount - ${contractDetails?.penaltyAmount && contractDetails?.penaltyAmount === '0.0E0' ? 'NULL' : 'BND ' + contractDetails?.penaltyAmount || 'NULL'}\n\n`
      }

      msg = msg + `*Bill Details*\n`

      if (list?.serviceStatus?.mobile?.code?.includes('ERROR')) {
        msg = msg + 'We are facing some technical issue. Please try again later.'
      } else {
        msg = msg + `Bill Id - ${latestMonthData && latestMonthData.length > 0 && latestMonthData[0]?.billUid || 'N/A'}\n`
        msg = msg + `Total Outstanding Amount - ${'BND ' + outstandingAmount || 'N/A'}\n`
        msg = msg + `Last Bill Month - ${latestMonthData && latestMonthData.length > 0 && latestMonthData[0]?.billMonth || 'N/A'}\n`
        msg = msg + `Bill Date - ${latestMonthData && latestMonthData.length > 0 && moment(latestMonthData[0]?.billDate).format('DD-MMM-YYYY') || 'N/A'} \n`
        msg = msg + `Due Date - ${latestMonthData && latestMonthData.length > 0 && moment(latestMonthData[0]?.dueDate).format('DD-MMM-YYYY') || 'N/A'}\n`
        msg = msg + `Bill Status - ${latestMonthData && latestMonthData.length > 0 && latestMonthData[0]?.billStatus || 'N/A'}\n`
        msg = msg + `Paid Date - ${latestMonthData && latestMonthData.length > 0 && latestMonthData[0]?.paidDate.includes('0001-01-01') ? 'NULL' : moment(latestMonthData[0]?.paidDate).format('DD-MMM-YYYY') || 'N/A'}\n`
        msg = msg + `Paid Amount - ${latestMonthData && latestMonthData.length > 0 && 'BND ' + latestMonthData[0]?.paidAmount || 'N/A'}\n`
        msg = msg + `Unpaid Amount - ${latestMonthData && latestMonthData.length > 0 && 'BND ' + latestMonthData[0]?.unpaidAmount || 'N/A'}\n`
        msg = msg + `Dispute Amount - ${latestMonthData && latestMonthData.length > 0 && 'BND ' + latestMonthData[0]?.disputeAmount || 'N/A'}\n`
        msg = msg + `Refund Amount - ${latestMonthData && latestMonthData.length > 0 && 'BND ' + latestMonthData[0]?.refundAmount || 'N/A'}\n`
      }
    }
    msg = msg + '\n\nType *Help* to return back to menu'
  } catch (error) {
    logger.debug('error--->', error)
    msg = msg + 'We are facing some technical issue. Please try again later.'
  }
  t = await sendWhatsappReply(pageObjectId, senderID, msg, whatsappSessionData.reportId, tr)
  return t
}

const sendfixedlineConnectionStatus = async (pageObjectId, senderID, list, whatsappSessionData, tr) => {

  const msg = `Fixedline Service Connection Status for: ${list?.customerSummary && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'AccessNo') && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'AccessNo')[0]?.value?.stringValue || 'NULL'} \n` +
    `Service Type - FIXEDLINE\n` +
    `Customer name - ${list?.customerSummary && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'CustomerName') && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'CustomerName')[0]?.value?.stringValue || 'NULL'}\n` +
    `Customer Status - ${list?.customerSummary?.return?.customerStatus && list?.customerSummary?.return?.customerStatus === 'ACTIVE' ? 'Active' : 'Inactive' || 'NULL'}\n` +
    `Account Status - ${list?.customerSummary?.return?.accountStatus && list?.customerSummary?.return?.accountStatus === 'ACTIVE' ? 'Active' : 'Inactive' || 'NULL'}\n` +
    `UNN Service Status - ${list?.serviceStatus?.fixedLine?.status && (list?.serviceStatus?.fixedLine?.status === 'ACTIVATED' || list?.serviceStatus?.fixedLine?.status === 'ACTIVE') ? 'Active' : 'Inactive' || 'NULL'}\n\n` +
    `Type *Help* to return back to main menu`
  logger.info('msg', msg)
  let t = await sendWhatsappReply(pageObjectId, senderID, msg, whatsappSessionData.reportId, tr)
  return t
}

const sendmobileConnectionStatus = async (pageObjectId, senderID, list, whatsappSessionData, tr) => {
  const msg = `Mobile Service Connection Status for: ${list?.customerSummary && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'AccessNo') && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'AccessNo')[0]?.value?.stringValue || 'NULL'} \n` +
    `Service Type -  ${list?.serviceStatus?.mobile?.subscriberType && list?.serviceStatus?.mobile?.subscriberType || 'NULL'}\n` +
    `Customer name - ${list?.customerSummary && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'CustomerName') && list?.customerSummary?.return?.context?.contextElements?.filter((e) => e?.name === 'CustomerName')[0]?.value?.stringValue || 'NULL'}\n` +
    `Customer Status - ${list?.customerSummary?.return?.customerStatus && list?.customerSummary?.return?.customerStatus === 'ACTIVE' ? 'Active' : 'Inactive' || 'NULL'}\n` +
    `Account Status - ${list?.customerSummary?.return?.accountStatus && list?.customerSummary?.return?.accountStatus === 'ACTIVE' ? 'Active' : 'Inactive' || 'NULL'}\n` +
    `UNN Service Status - ${list?.serviceStatus?.mobile?.subscriberStatus && list?.serviceStatus?.mobile?.subscriberStatus === 'ACTIVATED' ? 'Active' : 'Inactive' || 'NULL'}\n\n` +
    `Type *Help* to return back to main menu`
  logger.info('msg', msg)
  let t = await sendWhatsappReply(pageObjectId, senderID, msg, whatsappSessionData.reportId, tr)
  return t
}

const sendWhatsappReply = async (phoneNumberId, to, replyMessage, reportId) => {
  const t = await sequelize.transaction()
  try {
    logger.info('Sening whatsapp reply')

    const data1 = {
      reportId,
      toMsg: to,
      fromMsg: whatsapp.WHATSAPP_NUMBER,
      message: replyMessage,
      source: 'WHATSAPP',
      createdBy: systemUserId
    }
    await WhatsAppChatHistory.create(data1, { transaction: t })

    const json = {
      messaging_product: 'whatsapp',
      to: to,
      text: { body: replyMessage }
    }
    const data = JSON.stringify(json)
    const path = '/v15.0/' + phoneNumberId + '/messages?access_token=' + whatsapp.WHATSAPP_TOKEN
    const options = {
      host: 'graph.facebook.com',
      path: path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }
    const callback = (response) => {
      let str = ''
      response.on('data', (chunk) => {
        str += chunk
      })
      response.on('end', () => {
      })
    }
    const req = https.request(options, callback)
    req.on('error', (e) => {
      logger.info('Error occurred while sending whatsapp reply message')
    })
    req.write(data)
    req.end()
    logger.info('Successfully sent whatsapp reply')
    await t.commit()
    return 'Sent'
  } catch (error) {
    logger.error(error, 'Error while creating chat record')
    return 'Error'
  } finally {
    if (t && !t.finished) {
      await t.rollback()
    }
  }
}