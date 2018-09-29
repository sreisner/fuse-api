const { Product } = require('../db/models');

const createRoutes = router => {
  router.route('/products').get((req, res) => {
    Product.find()
      .select([
        '_id',
        'categoryId',
        'title',
        'description',
        'price',
        'numInStock',
        'images',
        'videoUrl',
        'manufacturer',
        'duration',
        'colors',
        'effects',
        'numShots',
      ])
      .then(products => res.json(products));
  });
};

module.exports = {
  createRoutes,
};
