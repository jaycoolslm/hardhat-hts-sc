import {
  AccountId,
  Client,
  PrivateKey,
  TokenAssociateTransaction,
  TokenId,
} from "@hashgraph/sdk";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Nft } from "../typechain-types";

const gasLimit = 5_000_000;
let nftContract: Nft;
let nftAddress: string;

const client = Client.forTestnet().setOperator(
  process.env.OPERATOR_ID!,
  process.env.OPERATOR_KEY!
);

describe("Nft", function () {
  it("Should deploy sc", async function () {
    nftContract = await ethers.deployContract("Nft", { gasLimit });
    await nftContract.waitForDeployment();
    console.log(nftContract.target);
    expect(nftContract.target).to.match(/^0x[a-fA-F0-9]{40}$/);
  });

  it("Should create NFT", async function () {
    nftContract.on("TokenCreated" as any, (tokenAddress, event) => {
      console.log("created address", tokenAddress);
      nftAddress = tokenAddress;
      expect(tokenAddress).to.match(/^0x[a-fA-F0-9]{40}$/);
    });

    const createNft = await nftContract.createNft(
      "Hashgraph Hub",
      "HUB",
      "Check out our YouTube channel!",
      0,
      [Buffer.from("https://youtube.com/@hashgraphhub")],
      {
        gasLimit: 5_000_000,
        value: ethers.parseEther("20"),
      }
    );
    await createNft.wait();
  });

  it("Should associate NFT with buyer", async function () {
    const buyer = (await ethers.getSigners())[1];

    const url =
      "https://testnet.mirrornode.hedera.com/api/v1/accounts/" + buyer.address;
    const res = await fetch(url);
    const json = await res.json();

    const hederaId = json.account;

    const tx = await new TokenAssociateTransaction()
      .setAccountId(hederaId)
      .setTokenIds([TokenId.fromSolidityAddress(nftAddress!)])
      .freezeWith(client)
      .sign(PrivateKey.fromStringECDSA(process.env.BUYER_KEY!));

    const txResponse = await tx.execute(client);
    const receipt = await txResponse.getReceipt(client);
    const code = receipt.status._code;
    expect(code).to.equal(22);
  });

  it("Should buy nft", async function () {
    nftContract.on(
      "TokenControllerMessage" as any,
      (msgType, fromAddress, amount, message, event) => {
        console.log("msgType", msgType);
        console.log("fromAddress", fromAddress);
        console.log("amount", amount);
        console.log("message", message);

        expect(message).to.be.equal("complete");
      }
    );

    const buyer = (await ethers.getSigners())[1];
    const tx = await nftContract
      .connect(buyer)
      .mintAndTransfer(nftAddress!, 0, {
        gasLimit,
        value: ethers.parseEther("1"),
      });

    await tx.wait();
  });
});
