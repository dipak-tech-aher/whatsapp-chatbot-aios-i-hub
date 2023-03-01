import { logger } from '../config/logger'
import {
  WorkflowHdr, InboundMessages
} from '../model/index'
import differenceInMinutes from 'date-fns/differenceInMinutes'
import { abandonedChatTimeout } from 'config'
import { Op } from 'sequelize'

export const processAbandonedChat = async () => {
  try {
    logger.info('Processing Abandone chats');

    const inboundMsgData = await InboundMessages.findAll({
      attributes: ['waId', 'createdAt'],
      where: { status: { [Op.ne]: 'closed' }, smsStatus: 'received', chatSource: 'WHATSAPP-I-HUB' },
      order: [
        ['inboundId', 'DESC']
      ]
    });

    if (inboundMsgData) {
      for (let i = 0; i < inboundMsgData.length; i++) {

        console.log('CURRENT DATE------->',new Date())
        console.log('inboundMsgData[i]?.createdAt------->',inboundMsgData[i]?.createdAt)

        console.log('differenceInMinutes(new Date(), inboundMsgData?.createdAt)', differenceInMinutes(new Date(), inboundMsgData[i].createdAt))

        if (differenceInMinutes(new Date(), inboundMsgData[i]?.createdAt) >= abandonedChatTimeout) {
          await WorkflowHdr.update({ wfStatus: 'DONE', wfContext: {} }, {
            where: {
              entityId: inboundMsgData[i]?.waId,
              entity: 'WHATSAPP-I-HUB'
            }
          })
          await InboundMessages.update({ status: 'closed' }, {
            where: {
              waId: inboundMsgData[i]?.waId,
              chatSource: 'WHATSAPP-I-HUB'
            }
          })
        }
      }
    }
    logger.info('Successfully Processed Abandone chats')
  } catch (error) {
    logger.error(error, 'Error while sending notification sms')
  }
}
