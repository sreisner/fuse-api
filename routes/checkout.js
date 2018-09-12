const uuid = require('uuid/v4');
const Order = require('../db/models/order');
const Product = require('../db/models/product');

const { canDeliverToZipCode } = require('./utils');

const stripe =
  process.env.NODE_ENV === 'production'
    ? require('stripe')(process.env.STRIPE_PRODUCTION_KEY)
    : require('stripe')(process.env.STRIPE_TEST_KEY);

const Square = require('square-connect');
const squareClient = Square.ApiClient.instance;

const oauth2 = squareClient.authentications.oauth2;
oauth2.accessToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN;

const VALID_EMAIL_REGEX = /\S+@\S+/;

const sendClientSideErrorResponse = (res, message) => {
  res.status(400).send({
    message,
  });
};

const validateName = userData => {
  return userData.firstName && userData.lastName;
};

const validateEmailAddress = userData => {
  return userData.email && VALID_EMAIL_REGEX.test(userData.email);
};

const validateDeliveryAddress = userData => {
  return userData.street && userData.city && userData.state && userData.zip;
};

const validateCanDeliverToZipCode = zip => {
  return canDeliverToZipCode(zip);
};

const validateUserData = (req, res, next) => {
  const { userData } = req.body;

  if (!userData) {
    sendClientSideErrorResponse(res, 'Missing user data in request.');
  } else if (!validateName(userData)) {
    sendClientSideErrorResponse(res, 'You must submit a first and last name.');
  } else if (!validateEmailAddress(userData)) {
    sendClientSideErrorResponse(res, 'You must submit a valid email address.');
  } else if (!validateDeliveryAddress(userData)) {
    sendClientSideErrorResponse(
      res,
      'You must submit a valid street address for delivery.'
    );
  } else if (!validateCanDeliverToZipCode(userData.zip)) {
    sendClientSideErrorResponse(
      res,
      `We do not currently deliver to given zip code: ${userData.zip}`
    );
  } else {
    next();
  }
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

const chargeCard = async (token, amountToCharge, userData) => {
  return await stripe.charges.create({
    amount: amountToCharge,
    currency: 'usd',
    source: token,
    description: `Charge for ${userData.firstName} ${userData.lastName}`,
  });
};

const createNewOrderRecord = async (userData, productData, amountCharged) => {
  const newOrder = new Order({
    ...userData,
    products: productData,
    amountCharged: amountCharged,
    status: 'Pending Delivery',
  });

  return await newOrder.save();
};

const updateProductCounts = async productData => {
  for (const boughtProduct of productData) {
    const inventoryProduct = await Product.findById(boughtProduct._id);
    inventoryProduct.numInStock -= boughtProduct.count;
    await inventoryProduct.save();
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
  router.route('/checkout').post(
    // validateUserData,
    // validateProductData,
    // validateAmountToCharge,
    async (req, res) => {
      const { userData, productData } = req.body;

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
    }
  );
};

module.exports = {
  createRoutes,
};
