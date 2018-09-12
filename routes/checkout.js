const uuid = require('uuid/v4');
const Order = require('../db/models/order');
const Product = require('../db/models/product');

const Square = require('square-connect');
const squareClient = Square.ApiClient.instance;

const oauth2 = squareClient.authentications.oauth2;
oauth2.accessToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

const sendClientSideErrorResponse = (res, message) => {
  res.status(400).send({
    message,
  });
};

const validateProductsInStock = async productData => {
  return Product.find()
    .then(inventory => {
      for (const requestedProduct of productData) {
        const inventoryProduct = inventory.find(
          item => item._id === requestedProduct._id
        );

        if (
          !inventoryProduct ||
          inventoryProduct.count < requestedProduct.count
        ) {
          return false;
        }
      }

      return true;
    })
    .catch(err => {
      throw err;
    });
};

const validateProductData = async (req, res, next) => {
  const { productData } = req.body;

  if (!productData) {
    sendClientSideErrorResponse(res, 'Missing product data in request.');
  } else if (productData.length <= 0) {
    res.status(204).end();
  } else if (!(await validateProductsInStock(productData))) {
    sendClientSideErrorResponse(
      res,
      "We're currently out of stock for one or more requested products."
    );
  } else {
    next();
  }
};

const validateAmountToCharge = async (req, res, next) => {
  const { productData, amountToCharge } = req.body;

  const inventoryProducts = await Product.find();

  const actualAmountToCharge = productData.reduce((sum, requestedProduct) => {
    const inventoryProduct = inventoryProducts.find(
      p => p._id === requestedProduct._id
    );

    return sum + inventoryProduct.retailPrice * requestedProduct.numItemsInCart;
  }, 0);

  if (actualAmountToCharge !== amountToCharge) {
    sendClientSideErrorResponse(
      res,
      'The computed amount to charge and the amount to charge displayed to the user was different'
    );
  } else {
    next();
  }
};

const createLineItems = async productData => {
  const lineItems = [];

  for (const requestedProduct of productData) {
    const product = await Product.findById(requestedProduct._id);

    const money = new Square.Money();
    money.amount = product.retailPrice;
    money.currency = 'USD';

    const lineItem = new Square.CreateOrderRequestLineItem();
    lineItem.name = product.title;
    lineItem.quantity = `${requestedProduct.numItemsInCart}`;
    lineItem.base_price_money = money;

    lineItems.push(lineItem);
  }

  return lineItems;
};

const createOrder = lineItems => {
  const idempotencyKey = uuid();
  const order = new Square.CreateOrderRequest();
  order.line_items = lineItems;
  order.idempotency_key = idempotencyKey;

  return order;
};

const createCheckoutRequest = order => {
  const checkoutRequest = new Square.CreateCheckoutRequest();
  checkoutRequest.idempotency_key = uuid();
  checkoutRequest.order = order;
  checkoutRequest.redirect_url = 'http://localhost:3000';

  return checkoutRequest;
};

const createRoutes = router => {
  router
    .route('/checkout')
    .post(validateProductData, validateAmountToCharge, async (req, res) => {
      const { productData } = req.body;

      const lineItems = await createLineItems(productData);
      const order = createOrder(lineItems);
      const checkoutRequest = createCheckoutRequest(order);
      const checkoutClient = new Square.CheckoutApi(squareClient);
      const response = await checkoutClient.createCheckout(
        process.env.SQUARE_SANDBOX_DSM_LOCATION_ID,
        checkoutRequest
      );

      res
        .status(200)
        .send({ checkoutUrl: response.checkout.checkout_page_url });
    });
};

module.exports = {
  createRoutes,
};
