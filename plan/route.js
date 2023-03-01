import { PlanService } from './service'
import express from 'express'
import { validateToken } from '../utils/authentication-helper'

const planRouter = express.Router()
const planService = new PlanService()

planRouter
  .get('/', validateToken, planService.getPlanList.bind(planService))
  .get('/:id', validateToken, planService.getPlan.bind(planService))

module.exports = planRouter
