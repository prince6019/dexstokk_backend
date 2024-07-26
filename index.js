const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const { ethers } = require("ethers");
const Wallet = require("./models/user");
const { auth } = require("./middleware/auth");

const transactionRouter = require("./routes/transaction");

const app = express();
app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin: ["http://localhost:5173", "https://dexstokkyam.vercel.app"],
  })
);
app.use("/sendTransaction", transactionRouter);

const uri = process.env.MONGODB_URI;

connect = () => {
  mongoose
    .connect(uri)
    .then(console.log("DB Connection Success"))
    .catch((err) => {
      console.log("DB Connection Failed");
      console.log(err);
      process.exit(1);
    });
};
connect();

const PORT = process.env.PORT || 3000;

function bytesToAlphanumeric(bytes) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  bytes.forEach((byte) => {
    result += chars[byte % chars.length];
  });
  return result;
}

app.post("/loginWallet", async (req, res) => {
  try {
    const { address, privateKey } = req.body;
    if (!address || !privateKey) {
      return res.status(400).json({
        success: false,
        message: "Please Fill up All the Required Fields",
      });
    }
    const wallet = new ethers.Wallet(privateKey);
    const _address = wallet.address;

    if (address !== _address) {
      return res.status(500).json({
        success: false,
        message: "wallet address or private key wrong , Please Try Again",
      });
    }
    const user = await Wallet.findOne({ address });
    let token;
    if (!user) {
      console.log("user not found");
      const randomBytes = ethers.utils.randomBytes(16);
      const randomAlphanumericString = bytesToAlphanumeric(randomBytes);
      console.log(`Random Alphanumeric String: ${randomAlphanumericString}`);
      const jsonFile = await wallet.encrypt(randomAlphanumericString);
      console.log(jsonFile);
      const _user = await Wallet.create({
        address: address,
        jsonWallet: JSON.stringify(jsonFile),
        password: randomAlphanumericString,
      });
      token = jwt.sign({ address: _user.address }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
    } else {
      console.log("user found");
      token = jwt.sign({ address: user.address }, process.env.JWT_SECRET, {
        expiresIn: "24h",
      });
    }

    res.status(200).json({
      success: true,
      token,
      address: user.address,
      message: "User Login Success",
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({
      success: false,
      message: "wallet connection Failure , Please Try Again",
    });
  }
});

// app.post("/sendTransaction", auth, async (req, res) => {
//   const { address } = req.user;
//   const { functionName, args, chainId } = req.body;

//   console.log("Address of wallet:", address);

//   try {
//     const user = await Wallet.findOne({ address });
//     if (!user) {
//       return res.status(404).json({ error: "Wallet not found" });
//     }

//     const jsonObj = JSON.parse(user.jsonWallet);
//     console.log("JSON File:", jsonObj);
//     let rpc;
//     if (chainId === 1) {
//       rpc = ALCHEMY_MAINNET_RPC_URL;
//     } else if (chainId === 100) {
//       rpc = ALCHEMY_GNOSIS_RPC_URL;
//     } else if (chainId === 11155111) {
//       rpc = ALCHEMY_HOLESKY_RPC_URL;
//     } else {
//       return res.status(400).json({ error: "chainID not supported" });
//     }
//     const provider = new ethers.providers.JsonRpcProvider(rpc);

//     const wallet = await ethers.Wallet.fromEncryptedJson(
//       jsonFile,
//       user.hashedPassword
//     );
//     const connectedWallet = wallet.connect(provider);

//     const contract = new ethers.Contract(
//       contractAddresses[chainId],
//       contractAbi,
//       connectedWallet
//     );

//     // Call the function on the smart contract
//     const tx = await contract[functionName](...args);

//     // Wait for the transaction to be mined
//     const receipt = await tx.wait();

//     res.status(200).json({
//       message: "Transaction successful",
//       transactionHash: receipt.transactionHash,
//       receipt: receipt,
//     });
//   } catch (error) {
//     console.error("Error sending transaction:", error);
//     res
//       .status(500)
//       .json({ error: "Transaction failed", details: error.message });
//   }
// });

// listening on port 3000-----------------
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
