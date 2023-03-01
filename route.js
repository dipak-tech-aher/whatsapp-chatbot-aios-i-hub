const express = require('express')

const planRouter = require('./plan/route')
const whatsappRouter = require('./whatsapp/route')

const mainRouter = express.Router()

mainRouter.use('/plans', planRouter)
mainRouter.use('/whatsapp', whatsappRouter)

module.exports = mainRouter
