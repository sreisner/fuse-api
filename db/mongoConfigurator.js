const mongoose = require('mongoose');
const connect = () => {
  mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true });
};

module.exports = {
  connect,
};
