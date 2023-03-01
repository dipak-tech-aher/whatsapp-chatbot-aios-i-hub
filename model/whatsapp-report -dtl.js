module.exports = function (sequelize, DataType) {
  const WhatsAppReportDtl = sequelize.define('WhatsAppReportDtl', {
    reportDtlId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    whatsappNumber: {
      type: DataType.STRING
    },
    contactNumber: {
      type: DataType.INTEGER
    },
    accessNumber: {
      type: DataType.STRING
    },
    serviceType: {
      type: DataType.STRING
    },
    intxnId: {
      type: DataType.INTEGER
    },
    reportId: {
      type: DataType.INTEGER
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'CREATED'
    },
    createdBy: {
      type: DataType.INTEGER
    },
    createdAt: {
      type: DataType.DATE
    },
    endAt: {
      type: DataType.DATE
    },
    updatedBy: {
      type: DataType.INTEGER
    },
    updatedAt: {
      type: DataType.DATE
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'whatsapp_report_dtl'
  }
  )

  WhatsAppReportDtl.associate = function (models) { }
  return WhatsAppReportDtl
}
