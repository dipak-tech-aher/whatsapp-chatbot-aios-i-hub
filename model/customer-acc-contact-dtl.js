module.exports = function (sequelize, DataType) {
  const CustomerAccContactDtl = sequelize.define('CustomerAccContactDtl', {
    custAccId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    customerId: {
      type: DataType.INTEGER
    },
    accountId: {
      type: DataType.INTEGER
    },
    contactId: {
      type: DataType.INTEGER
    },
    contactNo: {
      type: DataType.INTEGER
    },
    identificationNo: {
      type: DataType.STRING
    },
    planId: {
      type: DataType.INTEGER
    },
    planType: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING
    },
    remarks: {
      type: DataType.STRING
    },
    createdBy: {
      type: DataType.INTEGER
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
    tableName: 'customer_acc_contact_dtl'
  }
  )
  CustomerAccContactDtl.associate = function (models) {
  }
  return CustomerAccContactDtl
}
