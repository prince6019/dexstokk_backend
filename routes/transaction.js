const { Router } = require("express");
require("dotenv").config();
const Wallet = require("../models/user");
const { ethers } = require("ethers");
const { auth } = require("../middleware/auth");
const {
  contractAddresses,
  contractAbi,
} = require("../constants/contractIndex");

const transactionRouter = Router();
transactionRouter.use(auth);

const ALCHEMY_HOLESKY_RPC_URL = process.env.ALCHEMY_HOLESKY_RPC_URL;
const ALCHEMY_MAINNET_RPC_URL = process.env.ALCHEMY_MAINNET_RPC_URL;
const ALCHEMY_GNOSIS_RPC_URL = process.env.ALCHEMY_GNOSIS_RPC_URL;

const tokenAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() external view returns (uint8)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const getContract = async (address, chainId) => {
  try {
    const user = await Wallet.findOne({ address });
    if (!user) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    const jsonObj = JSON.parse(user.jsonWallet);
    let rpc;
    if (chainId === 1) {
      rpc = ALCHEMY_MAINNET_RPC_URL;
    } else if (chainId === 100) {
      rpc = ALCHEMY_GNOSIS_RPC_URL;
    } else if (chainId === 17000) {
      rpc = ALCHEMY_HOLESKY_RPC_URL;
    }
    console.log("rpc : ", rpc);

    const provider = new ethers.providers.JsonRpcProvider(rpc);
    const wallet = await ethers.Wallet.fromEncryptedJson(
      jsonObj,
      user.password
    );
    const signer = wallet.connect(provider);
    const estokkContract = new ethers.Contract(
      contractAddresses[chainId],
      contractAbi,
      signer
    );
    return { estokkContract, signer };
  } catch (e) {
    console.log(e);
  }
};

const createOffer = async (req, res) => {
  const {
    offerType,
    offerToken,
    buyerToken,
    buyerAddress,
    price,
    amount,
    address,
    chainId,
  } = req.body;
  console.log(
    "in creating offer : ",
    offerType,
    offerToken,
    buyerToken,
    buyerAddress,
    price,
    amount,
    address,
    chainId
  );
  try {
    const { estokkContract, signer } = await getContract(address, chainId);
    const tokenContract = new ethers.Contract(offerToken, tokenAbi, signer);
    let allowance = await tokenContract.allowance(
      address,
      contractAddresses[chainId]
    );
    console.log("allowance :", allowance);
    const offerTokenInfo = await estokkContract.tokenInfo(offerToken);
    const buyerTokenInfo = await estokkContract.tokenInfo(buyerToken);
    const offerTokenDecimals = parseInt(offerTokenInfo[0]._hex, 16);
    const buyerTokenDetails = parseInt(buyerTokenInfo[0]._hex, 16);
    const _priceInInt = ethers.utils.formatUnits(price, offerTokenDecimals); //offertokendecimals
    const _amountInInt = ethers.utils.formatUnits(amount, buyerTokenDetails); //buyertokendecimals
    const _amountToApproveInInt = _priceInInt * _amountInInt;
    const _amountToApproveInEthers = ethers.utils.parseUnits(
      _amountToApproveInInt.toString(),
      offerTokenDecimals
    );
    const amountToApprove =
      offerType === "buy" ? _amountToApproveInEthers : amount;
    console.log("amount to approve : ", amountToApprove);
    const newAllowance = allowance.add(amountToApprove);
    console.log("new allowance : ", parseInt(newAllowance._hex, 16));
    const balance = await tokenContract.balanceOf(address);
    console.log("balance of offer token L ", parseInt(balance._hex, 16));
    if (balance.lt(newAllowance)) {
      console.log("there is error");
      return res
        .status(404)
        .json({ error: "balance is too low than total amount to approve" });
    }
    const approveTx = await tokenContract.approve(
      contractAddresses[chainId],
      newAllowance
    );
    clg(approveTx);
    const tx = await estokkContract.createOffer(
      offerToken,
      buyerToken,
      buyerAddress,
      price,
      amount
    );
    await tx.wait(1);
    return res.status(200).json({ message: "success", txHash: tx });
  } catch (e) {
    console.log(e);
    return res.status(404).json({ e: e, error: "in  creating offer" });
  }
};

const buyOffer = async (req, res) => {
  const {
    offerType,
    offerId,
    offerToken,
    buyerToken,
    price,
    amount,
    address,
    chainId,
  } = req.body;
  console.log(
    "in buyOffers : ",
    offerType,
    offerToken,
    buyerToken,
    price,
    amount,
    address,
    chainId
  );
  try {
    const { estokkContract, signer } = await getContract(address, chainId);

    const tokenContract = new ethers.Contract(buyerToken, tokenAbi, signer);
    const allowance = await tokenContract.allowance(
      address,
      contractAddresses[chainId]
    );
    console.log("allowance :", allowance);

    const offerTokenInfo = await estokkContract.tokenInfo(offerToken);
    const buyerTokenInfo = await estokkContract.tokenInfo(buyerToken);
    const offerTokenDecimals = parseInt(offerTokenInfo[0]._hex, 16);
    const buyerTokenDetails = parseInt(buyerTokenInfo[0]._hex, 16);
    const _priceInInt = ethers.utils.formatUnits(price, offerTokenDecimals); //offertokendecimals
    const _amountInInt = ethers.utils.formatUnits(amount, buyerTokenDetails); //buyertokendecimals
    const _amountToApproveInInt = _priceInInt * _amountInInt;
    const _amountToApproveInEthers = ethers.utils.parseUnits(
      _amountToApproveInInt.toString(),
      offerTokenDecimals
    );

    const amountToApprove =
      offerType === "buy" ? amount : _amountToApproveInEthers;
    const newAllowance = allowance.add(amountToApprove);
    console.log("new allowance : ", parseInt(newAllowance._hex, 16));

    const balance = await tokenContract.balanceOf(address);
    if (balance.lt(newAllowance)) {
      return res
        .status(404)
        .json({ error: "balance is too low than total amount to approve" });
    }
    const approveTx = await tokenContract.approve(
      contractAddresses[chainId],
      newAllowance
    );
    await approveTx.wait(1);

    const tx = await estokkContract.buy(offerId, price, amount);
    await tx.wait(1);
    return res.status(200).json({ message: "success", txHash: tx });
  } catch (e) {
    console.log(e);
    return res.status(404).json({ e: e, error: "Wallet not found" });
  }
};

const deleteOffer = async (req, res) => {
  const {
    offerType,
    offerId,
    offerToken,
    buyerToken,
    price,
    amount,
    address,
    chainId,
  } = req.body;
  console.log(
    "in delete offers: ",
    offerType,
    offerToken,
    buyerToken,
    price,
    amount,
    address,
    chainId
  );
  try {
    const { estokkContract, signer } = await getContract(address, chainId);

    const tokenContract = new ethers.Contract(offerToken, tokenAbi, signer);
    const allowance = await tokenContract.allowance(
      address,
      contractAddresses[chainId]
    );
    console.log("allowance :", allowance);

    const offerTokenInfo = await estokkContract.tokenInfo(offerToken);
    const buyerTokenInfo = await estokkContract.tokenInfo(buyerToken);
    const offerTokenDecimals = parseInt(offerTokenInfo[0]._hex, 16);
    const buyerTokenDetails = parseInt(buyerTokenInfo[0]._hex, 16);
    const _priceInInt = ethers.utils.formatUnits(price, offerTokenDecimals); //offertokendecimals
    const _amountInInt = ethers.utils.formatUnits(amount, buyerTokenDetails); //buyertokendecimals
    const _amountToApproveInInt = _priceInInt * _amountInInt;
    const _amountToApproveInEthers = ethers.utils.parseUnits(
      _amountToApproveInInt.toString(),
      offerTokenDecimals
    );

    const amountToApprove =
      offerType === "buy" ? _amountToApproveInEthers : amount;
    const newAllowance = allowance.sub(amountToApprove);
    const balance = await tokenContract.balanceOf(address);
    if (balance.lt(newAllowance)) {
      return res
        .status(404)
        .json({ error: "balance is too low than total amount to approve" });
    }

    const approveTx = await tokenContract.approve(
      contractAddresses[chainId],
      newAllowance
    );
    console.log(approveTx);
    const tx = await estokkContract.deleteOffer(offerId);
    await tx.wait(1);
    return res.status(200).json({ message: "success", txHash: tx });
  } catch (e) {
    console.log(e);
    return res.status(404).json({ e: e, error: "Wallet not found" });
  }
};

const updateOffer = async (req, res) => {
  const {
    offerType,
    offerId,
    offerToken,
    buyerToken,
    price,
    amount,
    oldPrice,
    oldAmount,
    address,
    chainId,
  } = req.body;
  try {
    console.log(
      "in updateOffer : ",
      offerType,
      offerToken,
      buyerToken,
      price,
      amount,
      oldPrice,
      oldAmount,
      address,
      chainId
    );
    const { estokkContract, signer } = await getContract(address, chainId);

    const tokenContract = new ethers.Contract(offerToken, tokenAbi, signer);
    const allowance = await tokenContract.allowance(
      address,
      contractAddresses[chainId]
    );
    console.log("allowance :", parseInt(allowance._hex, 16));

    const offerTokenInfo = await estokkContract.tokenInfo(offerToken);
    const buyerTokenInfo = await estokkContract.tokenInfo(buyerToken);
    const offerTokenDecimals = parseInt(offerTokenInfo[0]._hex, 16);
    const buyerTokenDetails = parseInt(buyerTokenInfo[0]._hex, 16);
    const _priceInInt = ethers.utils.formatUnits(price, offerTokenDecimals); //offertokendecimals
    const _amountInInt = ethers.utils.formatUnits(amount, buyerTokenDetails); //buyertokendecimals
    const _amountToApproveInInt = _priceInInt * _amountInInt;
    const _amountToApproveInEthers = ethers.utils.parseUnits(
      _amountToApproveInInt.toString(),
      offerTokenDecimals
    );
    const _amountToSubtractInInt =
      offerType === "buy" ? oldPrice * oldAmount : oldAmount;
    const _amountToSubtractInEthers = ethers.utils.parseUnits(
      _amountToSubtractInInt.toString(),
      offerTokenDecimals
    );
    console.log(
      "amount to subtract: ",
      parseInt(_amountToSubtractInEthers._hex, 16)
    );

    const amountToApprove =
      offerType === "buy" ? _amountToApproveInEthers : amount;

    console.log("amount to approve : ", amountToApprove);
    const newAllowance = allowance
      .add(amountToApprove)
      .sub(_amountToSubtractInEthers);

    const balance = await tokenContract.balanceOf(address);
    if (balance.lt(newAllowance)) {
      return res
        .status(404)
        .json({ error: "balance is too low than total amount to approve" });
    }
    console.log("new allowance : ", parseInt(newAllowance._hex, 16));
    const approveTx = await tokenContract.approve(
      contractAddresses[chainId],
      newAllowance
    );
    await approveTx.wait(1);

    const tx = await estokkContract.updateOffer(offerId, price, amount);
    await tx.wait(1);
    return res.status(200).json({ message: "success", txHash: tx });
  } catch (e) {
    console.log(e);
    return res.status(404).json({ e: e, error: "Wallet not found" });
  }
};

transactionRouter.post("/createOffer", createOffer);
transactionRouter.post("/buyOffer", buyOffer);
transactionRouter.post("/deleteOffer", deleteOffer);
transactionRouter.post("/updateOffer", updateOffer);

module.exports = transactionRouter;
