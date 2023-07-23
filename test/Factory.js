const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (value) => ethers.parseEther(value.toString());

describe("Factory", () => {
  let owner;
  let factory;
  let token;
  let tokenAddress;
  let factoryAddress;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TKN", toWei(1000000));
    await token.waitForDeployment();

    tokenAddress = await token.getAddress();

    const Factory = await ethers.getContractFactory("Factory");
    factory = await Factory.deploy();
    await factory.waitForDeployment();

    factoryAddress = await factory.getAddress();
  });

  it("is deployed", async () => {
    expect(await factory.waitForDeployment()).to.equal(factory);
  });

  describe("createExchange", () => {
    it("deploys an exchange", async () => {
      const exchangeAddress = await factory.createExchange.staticCall(
        "LiqProvTokenETH",
        "LpTknEth",
        tokenAddress
      );
      await factory.createExchange("LiqProvTokenETH", "LpTknEth", tokenAddress);

      expect(await factory.tokenToExchange(tokenAddress)).to.equal(
        exchangeAddress
      );

      const Exchange = await ethers.getContractFactory("Exchange");
      const exchange = await Exchange.attach(exchangeAddress);
      expect(await exchange.name()).to.equal("LiqProvTokenETH");
      expect(await exchange.symbol()).to.equal("LpTknEth");
      expect(await exchange.factoryAddress()).to.equal(factoryAddress);
    });
    it("doesn't allow zero address", async () => {
      await expect(
        factory.createExchange(
          "LiqProvTokenETH",
          "LpTknEth",
          "0x0000000000000000000000000000000000000000"
        )
      ).to.be.revertedWith("invalid token address");
    });

    it("fails when exchange exists", async () => {
      await factory.createExchange("LiqProvTokenETH", "LpTknEth", tokenAddress);

      await expect(
        factory.createExchange("LiqProvTokenETH", "LpTknEth", tokenAddress)
      ).to.be.revertedWith("exchange already exists");
    });
  });

  describe("getExchange", () => {
    it("returns exchange address by token address", async () => {
      const exchangeAddress = await factory.createExchange.staticCall(
        "LiqProvTokenETH",
        "LpTknEth",
        tokenAddress
      );
      await factory.createExchange("LiqProvTokenETH", "LpTknEth", tokenAddress);

      expect(await factory.getExchange(tokenAddress)).to.equal(exchangeAddress);
    });
  });
});
