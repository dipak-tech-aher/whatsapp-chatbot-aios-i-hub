module.exports = function (sequelize, DataType) {
  const WhatsAppReport = sequelize.define('WhatsAppReport', {
    reportId: {
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
    status: {
      type: DataType.STRING,
      defaultValue: 'CREATED'
    },
    createdBy: {
      type: DataType.INTEGER
    },
    endAt: {
      type: DataType.DATE
    },
    createdAt: {
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
    tableName: 'whatsapp_report'
  }
  )

  WhatsAppReport.associate = function (models) { }
  return WhatsAppReport
}
