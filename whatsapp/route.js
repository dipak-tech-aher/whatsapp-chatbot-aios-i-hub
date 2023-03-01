import express from 'express'
import { WhatsappService } from './service'

const router = express.Router()
const WhatsAppService = new WhatsappService()

router
  .get('/webhook', WhatsAppService.fbGet.bind(WhatsAppService))
  .post('/webhook', WhatsAppService.fbPost.bind(WhatsAppService))
  .post('/inbound-msg', WhatsAppService.inboundMsg.bind(WhatsAppService))
  .post('/', WhatsAppService.whatsAppWorkflow.bind(WhatsAppService))

  // APIS BY WORKFLOW ENGINE
  .post('/validate-user', WhatsAppService.validateUser.bind(WhatsAppService))
  .post('/get-customer-summary', WhatsAppService.getCustomerSummary.bind(WhatsAppService))
  .post('/get-customer-summary-fixedline', WhatsAppService.getCustomerSummaryFixedline.bind(WhatsAppService))
  .post('/get-customer-summary-mobile', WhatsAppService.getCustomerSummaryMobile.bind(WhatsAppService))
  .post('/get-open-tickets', WhatsAppService.getOpenTickets.bind(WhatsAppService))
  .post('/get-active-offers', WhatsAppService.getActiveOffers.bind(WhatsAppService))
  .post('/contract-details', WhatsAppService.contractDetails.bind(WhatsAppService))


module.exports = router
