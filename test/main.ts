import { hethers } from "@hashgraph/hethers";
import {
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from "@hashgraph/sdk";
import { expect } from "chai";
import Nft from "../artifacts/contracts/Nft.sol/Nft.json";

const client = Client.forTestnet().setOperator(
  process.env.OPERATOR_ID!,
  process.env.OPERATOR_KEY!
);

const provider = hethers.providers.getDefaultProvider("testnet");
// config for owner address
const ownerAddress = hethers.utils.getAddressFromAccount(process.env.OWNER_ID!);
const ownerAccount = hethers.utils.getAccountFromAddress(ownerAddress);
const ownerWallet = new hethers.Wallet(
  {
    address: ownerAddress,
    privateKey: process.env.OWNER_KEY!,
  },
  provider
);
// config for buyer address
const buyerAddress = hethers.utils.getAddressFromAccount(process.env.BUYER_ID!);
const buyerAccount = hethers.utils.getAccountFromAddress(buyerAddress);
const buyerWallet = new hethers.Wallet(
  {
    address: buyerAddress,
    privateKey: process.env.BUYER_KEY!,
  },
  provider
);

describe("Nft", function () {
  let nftContract: hethers.Contract;
  let nftContractAddress: string;
  let nftAddress: string;

  it("Should deploy Nft contract", async function () {
    const factory = new hethers.ContractFactory(
      Nft.abi,
      Nft.bytecode,
      ownerWallet
    );
    nftContract = await factory.deploy({ gasLimit: 5_000_000 });
    await nftContract.deployed();
    nftContractAddress = nftContract.address;
    console.log("Nft contract deployed to: ", nftContractAddress);
    expect(nftContractAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
  });

  it("Should create NFT", async function () {
    const createNft = await nftContract.createNft(
      "Hashgraph Hub",
      "HUB",
      "Check out our YouTube channel!",
      0,
      [Buffer.from("https://youtube.com/@hashgraphhub")],
      {
        gasLimit: 5_000_000,
        value: hethers.utils.parseHbar("20"),
      }
    );

    const receipt = await createNft.wait();
    console.log("NFT Create events", receipt.events);
    const event = receipt.events?.filter(
      (e: any) => e.event === "TokenCreated"
    )[0];

    nftAddress = event.args.tokenAddress;
    console.log("NFT address: ", nftAddress);
    expect(nftAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
  });

  it("Should associate NFT with buyer", async function () {
    const tx = await new TokenAssociateTransaction()
      .setAccountId(AccountId.fromSolidityAddress(buyerAddress))
      .setTokenIds([TokenId.fromSolidityAddress(nftAddress!)])
      .freezeWith(client)
      .sign(PrivateKey.fromStringECDSA(process.env.BUYER_KEY!));

    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const code = receipt.status._code;
    expect(code).to.equal(22);
  });

  it("Should transfer NFT to buyer", async function () {
    const buyNft = await nftContract
      .connect(buyerWallet)
      .mintAndTransfer(nftAddress, 0, {
        gasLimit: 5_000_000,
        value: hethers.utils.parseHbar("1"),
      });

    const receipt = await buyNft.wait();
    console.log("NFT buy events", receipt.events);
    const event = receipt.events?.filter(
      (e: any) => e.event === "TokenControllerMessage"
    )[0];
    console.log("Buy NFT data: ", event.args);
  });
});
