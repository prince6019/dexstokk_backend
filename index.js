const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const cors = require("cors");
const { ethers } = require("ethers");
const Wallet = require("./models/user");
const { auth } = require("./middleware/auth");

const app = express();
app.use(express.json());
app.use(cors());

const uri = process.env.MONGODB_URI;
console.log("uri : ", uri);
console.log("jwt : ", process.env.JWT_SECRET);

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

const port = 3000;

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
    const jsonFile = await walletfromPrivate.encrypt(password);
    console.log(jsonFile);
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("hashed Password", hashedPassword);

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
});

// listening on port 3000-----------------
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
