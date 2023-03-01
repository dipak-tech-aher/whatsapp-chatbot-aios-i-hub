module.exports = {
  stringEncoding: process.env.STRING_ENCODING || 'utf-8',
  base64Encoding: process.env.BASE64_ENCODING || 'base64',
  algorithm: process.env.ENCRYPTION_ALGORITH || 'aes256',
  hashAlgorithm: process.env.HASH_ALGORITHM || 'sha256',
  secret: process.env.APP_SECRET || 'TybomcUDJmlkjK1bfZEBscyTFLZGnR2B',
  iv: process.env.IV || 'cxeF5YjtlyKZnLbZ',
  sessionTimeOut: 15000 * 60 * 60,
  systemUserId: 0,
  abandonedChatTimeout: 5,
  iHubWorkflowId: 10,
  dbProperties: {
    database: process.env.POSTGRES_DATABASE || 'aios',
    username: process.env.POSTGRES_USER || 'imagine',
    password: process.env.POSTGRES_PASSWORD || 'imagine123!@#',
    host: process.env.POSTGRES_HOST || '192.168.4.62',
    dialect: process.env.DATABASE_DIALECT || 'postgres',
    port: process.env.DATABASE_PORT || 5432,
    dialectOptions: {
      statement_timeout: 5000,
      idle_in_transaction_session_timeout: 15000
    }

  },
  aios: {
    host: process.env.SERVICE_HOST || 'http://localhost',
    port: process.env.SERVICE_PORT || 4003
  },
  tibco: {
    apiEndPoint: 'http://172.17.59.11:9208',
    customerAPIEndPoint: 'http://172.17.59.11:9209',
    customerStatusAPIEndPoint: 'http://172.17.59.11:9220',
    accountDetailsAPIEndPoint: 'http://172.17.59.11:9221',
    billInfoAPIEndPoint: 'http://172.17.59.11:9223',
    serviceStatusAPIEndPoint: 'http://172.17.59.11:9043',
    prepaidBoosterDetailsAPIEndPoint: 'http://172.17.59.11:9226',
    fixedlineServiceStatusAPIEndPoint: 'http://172.17.59.11:9228',
    fixedlinePlanInfoAPIEndPoint: 'http://172.17.59.11:9227',
    fixedlineBoosterDetailsAPIEndPoint: 'http://172.17.59.11:9145',
    prepaidCreditDetailsAPIEndPoint: 'http://172.17.59.11:9227',
    contractDetailsAPIEndPoint: 'http://172.17.59.11:9229',
    accessNumberAPI: '/aios/accessnumbers',
    customerSummaryAPI: '/aios/customersummary',
    customerStatusAPI: '/checkcustomerexists',
    accountDetailsAPI: '/aios/getaccountdetails',
    billInfoAPI: '/aios/getBillInfo',
    serviceStatusAPI: '/searchcustomer',
    prepaidBoosterDetailsAPI: '/prepaid/querybalance',
    fixedlineServiceStatusAPI: '/aios/servicestatusfixedline',
    fixedlinePlanInfoAPI: '/planinfofixedline',
    fixedlineBoosterDetailsAPI: '/querybalance',
    prepaidCreditDetailsAPI: '/prepaidcredit',
    contractDetailsAPI: '/getcontractstatus',
    username: 'Aios',
    passwd: '$Tibc0@Aios$',
    source: 'AIOS'
  },
  whatsapp: {
    FB_VERIFY_TOKEN: '1234',
    FB_BASE_API_URL: 'https://graph.facebook.com',
    WHATSAPP_TOKEN: 'EAAxZCWba81DUBANIPwSQv7v8A8eZBJAjwcfF7ARYMzANgTrVClzZBsloZCOZBL1pgAPu1bs0yZBgGqRS8b32AcSZAkjwT9QoiKRwTsasJeVPmZBb0EddXZBV9VMDEFKXB03po2jiyOZBXexxUi8zTfsiD60Jz0A7ux0JDZAj91rLuqMdXAAQDEr7DLYqggspooDejIiOS1Cy8XlqgZDZD',
    WHATSAPP_NUMBER: '+15550911036',
    PHONENUMBERID: '101415729481713'
  }
}
