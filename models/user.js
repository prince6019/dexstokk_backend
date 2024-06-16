// Import the Mongoose library
const mongoose = require("mongoose");

// Define the user schema using the Mongoose Schema constructor
const walletSchema = new mongoose.Schema({
  // Define the name field with type String, required, and trimmed
  address: {
    type: String,
    required: true,
  },
  jsonWallet: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

// Export the Mongoose model for the user schema, using the name "user"
module.exports = mongoose.model("wallet", walletSchema);
