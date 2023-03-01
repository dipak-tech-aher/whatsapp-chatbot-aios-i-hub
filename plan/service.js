import { logger } from '../config/logger'
import { ResponseHelper } from '../utils'
import { Plan, PlanOffer } from '../model'
import { defaultMessage } from '../utils/constant'

const PLAN_TYPES = ['BASE', 'BALANCE', 'VAS']
const PROD_TYPES = ['Fixed', 'Prepaid', 'Postpaid']

export class PlanService {
  constructor () {
    this.responseHelper = new ResponseHelper()
  }

  async getPlan (req, res) {
    try {
      logger.debug('Getting Plan details by ID')
      const { id } = req.params
      if (!id) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.MANDATORY_FIELDS_MISSING))
      }
      const response = await Plan.findOne({
        where: {
          planId: id
        }
      })
      logger.debug('Successfully fetch Plan data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Plan data')
      return this.responseHelper.onError(res, new Error('Error while fetching Plan data'))
    }
  }

  async getPlanList (req, res) {
    try {
      let planType = req.query.plantype

      if (planType && !PLAN_TYPES.includes(planType)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      } else {
        if (!planType) {
          planType = 'BASE'
        }
      }

      const prodType = req.query.prodtype

      if (prodType && !PROD_TYPES.includes(prodType)) {
        return this.responseHelper.validationError(res, new Error(defaultMessage.UN_PROCESSIBLE_ENTITY))
      }

      const where = {}
      if (planType) {
        if (planType === 'BALANCE') {
          where.planType = ['TOPUP', 'BOOSTER']
        } else {
          where.planType = planType
        }
      }
      if (prodType) {
        where.prodType = prodType
      }
      where.status = 'AC'

      logger.debug('Getting Plan list')
      const response = await Plan.findAll({
        attributes: ['planId', 'prodType', 'planName', 'bandwidth', 'networkType', 'charge',
          'validity', 'planCategory', 'prodCatType', 'planType', 'planCategory'
        ],
        include: [
          {
            model: PlanOffer,
            as: 'planoffer',
            attributes: ['planOfferId', 'planId', 'quota', 'offerId', 'units', 'offerType']
          }
        ],
        where: where,
        order: [
          ['planId', 'ASC']
        ]
      })
      logger.debug('Successfully fetch Plan data')
      return this.responseHelper.onSuccess(res, defaultMessage.SUCCESS, response)
    } catch (error) {
      logger.error(error, 'Error while fetching Plan data')
      return this.responseHelper.onError(res, new Error('Error while fetching Plan data'))
    }
  }
}
