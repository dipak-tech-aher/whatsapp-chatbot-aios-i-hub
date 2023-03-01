import {
  processAbandonedChat
} from './job-service'
import { logger } from '../config/logger'

const cron = require('node-cron')
// Running job at every minute

export const processChat = cron.schedule('*/1 * * * *', () => {
  logger.debug('Start process chat')
  processAbandonedChat()
  logger.debug('End process chat')
},
{
  scheduled: false
})
