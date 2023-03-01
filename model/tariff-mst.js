module.exports = function (sequelize, DataType) {
  const TariffMst = sequelize.define('TariffMst', {
    tariffId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tariffCode: {
      type: DataType.STRING
    },
    tariffDesc: {
      type: DataType.STRING
    },
    tariffType: {
      type: DataType.STRING
    },
    packageCode: {
      type: DataType.STRING
    },
    packageDesc: {
      type: DataType.STRING
    },
    packageCategory: {
      type: DataType.STRING
    },
    bandwidth: {
      type: DataType.INTEGER
    },
    networkType: {
      type: DataType.STRING
    },
    charge: {
      type: DataType.INTEGER
    },
    refillProfileId: {
      type: DataType.STRING
    },
    status: {
      type: DataType.STRING,
      defaultValue: 'AC'
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
    },
    validity: {
      type: DataType.STRING
    },
    mrc: {
      type: DataType.STRING
    },
    nrc: {
      type: DataType.STRING
    },
    planCategory: {
      type: DataType.STRING
    },
    prodCatType: {
      type: DataType.STRING
    },
    commPackName: {
      type: DataType.STRING
    },
    ocsDesc: {
      type: DataType.STRING
    },
    serviceCls: {
      type: DataType.STRING
    },
    contract: {
      type: DataType.STRING
    }
  },
  {
    timestamps: true,
    underscored: true,
    tableName: 'tariff_mst'
  }
  )

  TariffMst.associate = function (models) {
  }
  return TariffMst
}
