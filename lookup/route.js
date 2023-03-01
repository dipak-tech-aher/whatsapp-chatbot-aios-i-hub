import { LookupService } from './service'
import express from 'express'

const lookupRouter = express.Router()
const lookupService = new LookupService()

lookupRouter
  .post('/business-entity', lookupService.getMultipleBusinessEntities.bind(lookupService))
  .get('/business-entity', lookupService.getBusinessEntity.bind(lookupService))
  .get('/address-lookup', lookupService.getAddressLookup.bind(lookupService))
  .get('/roles', lookupService.getDepartmentAndRoles.bind(lookupService))
  .get('/users', lookupService.getUsersRoleId.bind(lookupService))

module.exports = lookupRouter
