import 'babel-polyfill'
import express from 'express'
import bodyParser from 'body-parser'
import config from 'config'
import { logger } from './config/logger'
import { processChat } from './jobs/aios-cron'
import { sequelize } from './model'

const cors = require('cors')
const app = express()
const port = config.aios.port

app.use(cors())
app.use(bodyParser.json({ limit: '20mb' }))
app.use(bodyParser.urlencoded({ extended: true }))
const routes = require('./route')
app.use('/api', routes)
const server = require('http').createServer(app)

sequelize
  .authenticate()
  .then(() => {
    logger.debug('Connection has been established successfully, Using Configuration ', config.dbProperties.host + '/' + config.dbProperties.database)
    server.listen(port, (err) => {
      if (err) {
        logger.error('Error occured while starting server: ', err)
        return
      }
      logger.debug('Server started in port no: ', port)
    })
  })
  .catch(err => {
    console.error('Unable to connect to the database:', err);
  });

app.post('/jobs/:state', (req, res) => {
  const { state } = req.params
  if (state === 'start') {
    logger.debug('=================Abandoned Chat JOB STARTED=============')
    processChat.start()
  } else {
    logger.debug('=================Abandoned Chat JOB STOPPED=============')
    processChat.stop()
  }
  res.json({ status: 'ok' })
})
