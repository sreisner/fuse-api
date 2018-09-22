const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductImageSchema = Schema({
  src: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    required: true,
  },
});

const ProductSchema = Schema(
  {
    _id: {
      type: Number,
      required: true,
    },
    categoryId: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    numInStock: {
      type: Number,
      required: true,
    },
    images: {
      type: [ProductImageSchema],
      required: true,
    },
    videoUrl: {
      type: String,
      required: false,
    },
    manufacturer: {
      type: String,
      required: false,
    },
    duration: {
      type: Number,
      required: false,
    },
    colors: {
      type: [String],
      required: false,
    },
    effects: {
      type: [String],
      required: false,
    },
    numShots: {
      type: Number,
      required: false,
    },
  },
  { collection: 'products' }
);

module.exports = mongoose.model('Product', ProductSchema);
