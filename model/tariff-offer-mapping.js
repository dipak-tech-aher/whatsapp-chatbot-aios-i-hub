module.exports = function (sequelize, DataType) {
  const TariffOfferMapping = sequelize.define('TariffOfferMapping', {
    tariffOfferId: {
      type: DataType.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tariffId: {
      type: DataType.INTEGER
    },
    quota: {
      type: DataType.INTEGER
    },
    offerId: {
      type: DataType.STRING
    },
    units: {
      type: DataType.STRING
    },
    offerType: {
      type: DataType.INTEGER
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
    tableName: 'tariff_offer_mapping'
  }
  )

  TariffOfferMapping.associate = function (models) {
  }

  return TariffOfferMapping
}
