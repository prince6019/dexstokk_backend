const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const { ethers } = require("ethers");
const Wallet = require("./models/user");
const { auth } = require("./middleware/auth");

const { contractAddresses, contractAbi } = require("./constants/contractIndex");

const app = express();
app.use(express.json());
app.use(
  cors({
    credentials: true,
    origin: ["http://localhost:5173", "https://dexstokkyam.vercel.app"],
  })
);

const uri = process.env.MONGODB_URI;
const ALCHEMY_SEPOLIA_RPC_URL = process.env.ALCHEMY_SEPOLIA_RPC_URL;
const ALCHEMY_MAINNET_RPC_URL = process.env.ALCHEMY_MAINNET_RPC_URL;
const ALCHEMY_GNOSIS_RPC_URL = process.env.ALCHEMY_GNOSIS_RPC_URL;

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

app.post("/generateWallet", async (req, res) => {
  const { password } = req.body;
  console.log("password provided : ", password);
  if (!password) {
    return res.status(400).json({ error: "password is required" });
  }
  try {
    // Generate EVM key pair
    const wallet = ethers.Wallet.createRandom();
    const privateKey = wallet.privateKey;
    const publicKey = wallet.address;
    console.log("privateKey : ", privateKey);
    console.log("publicKey : ", publicKey);

    const walletfromPrivate = new ethers.Wallet(privateKey);
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("hashed Password", hashedPassword);
    const jsonFile = await walletfromPrivate.encrypt(hashedPassword);
    console.log(jsonFile);

    const user = await Wallet.create({
      address: publicKey,
      jsonWallet: JSON.stringify(jsonFile),
      password: hashedPassword,
    });

    const token = jwt.sign({ address: user.address }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });

    return res.status(200).json({
      token,
      address: user.address,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ message: "wallet cannot be created , Please try again." });
  }
});

app.get("/backupWallet", auth, async (req, res) => {
  const { address } = req.user;
  console.log("address of wallet : ", address);
  try {
    const user = await Wallet.findOne({ address });
    return res.status(200).json({ user });
  } catch (e) {
    console.log(e);
  }
});

app.post("/loginWallet", async (req, res) => {
  try {
    const { address, password } = req.body;

    if (!address || !password) {
      return res.status(400).json({
        success: false,
        message: "Please Fill up All the Required Fields",
      });
    }

    const user = await Wallet.findOne({ address });

    if (!user) {
      // Return 401 Unauthorized status code with error message
      return res.status(401).json({
        success: false,
        message: "User is not Registered with Us Please SignUp to Continue",
      });
    }

    if (await bcrypt.compare(password, user.password)) {
      const token = jwt.sign(
        { address: user.address },
        process.env.JWT_SECRET,
        {
          expiresIn: "24h",
        }
      );

      res.status(200).json({
        success: true,
        token,
        address: user.address,
        message: "User Login Success",
      });
    } else {
      return res.status(401).json({
        success: false,
        message: "Password is incorrect",
      });
    }
  } catch (error) {
    console.error(error);
    // Return 500 Internal Server Error status code with error message
    return res.status(500).json({
      success: false,
      message: "wallet connection Failure , Please Try Again",
    });
  }
});

app.post("/sendTransaction", auth, async (req, res) => {
  const { address } = req.user;
  const { functionName, args, chainId } = req.body;

  console.log("Address of wallet:", address);

  try {
    const user = await Wallet.findOne({ address });
    if (!user) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    const jsonObj = JSON.parse(user.jsonWallet);
    console.log("JSON File:", jsonObj);
    let rpc;
    if (chainId === 1) {
      rpc = ALCHEMY_MAINNET_RPC_URL;
    } else if (chainId === 100) {
      rpc = ALCHEMY_GNOSIS_RPC_URL;
    } else if (chainId === 11155111) {
      rpc = ALCHEMY_SEPOLIA_RPC_URL;
    } else {
      return res.status(400).json({ error: "chainID not supported" });
    }
    const provider = new ethers.providers.JsonRpcProvider(rpc);

    const wallet = await ethers.Wallet.fromEncryptedJson(
      jsonFile,
      user.hashedPassword
    );
    const connectedWallet = wallet.connect(provider);

    const contract = new ethers.Contract(
      contractAddresses[chainId],
      contractAbi,
      connectedWallet
    );

    // Call the function on the smart contract
    const tx = await contract[functionName](...args);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();

    res.status(200).json({
      message: "Transaction successful",
      transactionHash: receipt.transactionHash,
      receipt: receipt,
    });
  } catch (error) {
    console.error("Error sending transaction:", error);
    res
      .status(500)
      .json({ error: "Transaction failed", details: error.message });
  }
});

// app.get("/querSubgraph" , (req,res) =>{

// })

// listening on port 3000-----------------
app.listen(PORT, () => {
  console.log(`Example app listening on port ${PORT}`);
});
