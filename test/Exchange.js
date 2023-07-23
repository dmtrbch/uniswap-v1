const { expect } = require("chai");
const { ethers } = require("hardhat");

const toWei = (value) => ethers.parseEther(value.toString());

const fromWei = (value) =>
  ethers.formatEther(typeof value === "string" ? value : value.toString());

const createExchange = async (
  factory,
  lpTokenName,
  lpTokenSymbol,
  tokenAddress,
  sender
) => {
  const exchangeAddress = await factory
    .connect(sender)
    .createExchange.staticCall(lpTokenName, lpTokenSymbol, tokenAddress);

  await factory
    .connect(sender)
    .createExchange(lpTokenName, lpTokenSymbol, tokenAddress);

  const Exchange = await ethers.getContractFactory("Exchange");

  return await Exchange.attach(exchangeAddress);
};

describe("Exchange", () => {
  let owner;
  let user;
  let exchange;
  let token;
  let tokenAddress;
  let exchangeAddress;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    token = await Token.deploy("Token", "TKN", toWei(1000000));
    await token.waitForDeployment();

    tokenAddress = await token.getAddress();

    const Exchange = await ethers.getContractFactory("Exchange");
    exchange = await Exchange.deploy(
      "LiqProvTokenETH",
      "LpTknEth",
      tokenAddress
    );
    await exchange.waitForDeployment();

    exchangeAddress = await exchange.getAddress();
  });

  it("is deployed", async () => {
    expect(await exchange.waitForDeployment()).to.equal(exchange);
    expect(await exchange.name()).to.equal("LiqProvTokenETH");
    expect(await exchange.symbol()).to.equal("LpTknEth");
    expect(await exchange.totalSupply()).to.equal(toWei(0));
    expect(await exchange.factoryAddress()).to.equal(owner.address);
  });

  describe("addLiquidity", async () => {
    describe("empty reserves", async () => {
      it("adds liquidity", async () => {
        await token.approve(exchangeAddress, toWei(200));
        await exchange.addLiquidity(toWei(200), { value: toWei(100) });

        expect(await ethers.provider.getBalance(exchangeAddress)).to.equal(
          toWei(100)
        );
        expect(await exchange.getReserve()).to.equal(toWei(200));
      });

      it("mints LP tokens", async () => {
        await token.approve(exchangeAddress, toWei(200));
        await exchange.addLiquidity(toWei(200), { value: toWei(100) });

        expect(await exchange.balanceOf(owner.address)).to.eq(toWei(100));
        expect(await exchange.totalSupply()).to.eq(toWei(100));
      });

      it("allows zero amounts", async () => {
        await token.approve(exchangeAddress, 0);
        await exchange.addLiquidity(0, { value: 0 });

        expect(await ethers.provider.getBalance(exchangeAddress)).to.equal(0);
        expect(await exchange.getReserve()).to.equal(0);
      });
    });

    describe("existing reserves", async () => {
      beforeEach(async () => {
        await token.approve(exchangeAddress, toWei(300));
        await exchange.addLiquidity(toWei(200), { value: toWei(100) });
      });

      it("preserves exchange rate", async () => {
        await exchange.addLiquidity(toWei(200), { value: toWei(50) });

        expect(await ethers.provider.getBalance(exchangeAddress)).to.equal(
          toWei(150)
        );
        expect(await exchange.getReserve()).to.equal(toWei(300));
      });

      it("mints LP tokens", async () => {
        await exchange.addLiquidity(toWei(200), { value: toWei(50) });

        expect(await exchange.balanceOf(owner.address)).to.eq(toWei(150));
        expect(await exchange.totalSupply()).to.eq(toWei(150));
      });

      it("fails when not enough tokens", async () => {
        await expect(
          exchange.addLiquidity(toWei(50), { value: toWei(50) })
        ).to.be.revertedWith("insufficient token amount");
      });
    });
  });

  describe("removeLiquidity", async () => {
    beforeEach(async () => {
      await token.approve(exchangeAddress, toWei(300));
      await exchange.addLiquidity(toWei(200), { value: toWei(100) });
    });

    it("removes some liquidity", async () => {
      const userEtherBalanceBefore = await ethers.provider.getBalance(
        owner.address
      );
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange.removeLiquidity(toWei(25));

      expect(await exchange.getReserve()).to.equal(toWei(150));
      expect(await ethers.provider.getBalance(exchangeAddress)).to.equal(
        toWei(75)
      );

      const userEtherBalanceAfter = await ethers.provider.getBalance(
        owner.address
      );
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      expect(fromWei(userEtherBalanceAfter - userEtherBalanceBefore)).to.equal(
        "24.99993591437032106"
      ); // 25 - gas fees

      expect(fromWei(userTokenBalanceAfter - userTokenBalanceBefore)).to.equal(
        "50.0"
      );
    });

    it("removes all liquidity", async () => {
      const userEtherBalanceBefore = await ethers.provider.getBalance(
        owner.address
      );
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange.removeLiquidity(toWei(100));

      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await ethers.provider.getBalance(exchangeAddress)).to.equal(
        toWei(0)
      );

      const userEtherBalanceAfter = await ethers.provider.getBalance(
        owner.address
      );
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      expect(fromWei(userEtherBalanceAfter - userEtherBalanceBefore)).to.equal(
        "99.999949070195735118"
      ); // 100 - gas fees

      expect(fromWei(userTokenBalanceAfter - userTokenBalanceBefore)).to.equal(
        "200.0"
      );
    });

    it("pays for provided liquidity", async () => {
      const userEtherBalanceBefore = await ethers.provider.getBalance(
        owner.address
      );
      const userTokenBalanceBefore = await token.balanceOf(owner.address);

      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(18), { value: toWei(10) });

      await exchange.removeLiquidity(toWei(100));

      expect(await exchange.getReserve()).to.equal(toWei(0));
      expect(await ethers.provider.getBalance(exchangeAddress)).to.equal(
        toWei(0)
      );
      expect(fromWei(await token.balanceOf(user.address))).to.equal("18.0");

      const userEtherBalanceAfter = await ethers.provider.getBalance(
        owner.address
      );
      const userTokenBalanceAfter = await token.balanceOf(owner.address);

      expect(fromWei(userEtherBalanceAfter - userEtherBalanceBefore)).to.equal(
        "109.999949276620018794"
      ); // 110 - gas fees

      expect(fromWei(userTokenBalanceAfter - userTokenBalanceBefore)).to.equal(
        "182.0"
      );
    });

    it("burns LP-tokens", async () => {
      await expect(() =>
        exchange.removeLiquidity(toWei(25))
      ).to.changeTokenBalance(exchange, owner, toWei(-25));

      expect(await exchange.totalSupply()).to.equal(toWei(75));
    });

    it("doesn't allow invalid amount", async () => {
      await expect(exchange.removeLiquidity(toWei(100.1))).to.be.revertedWith(
        "ERC20: burn amount exceeds balance"
      );
    });
  });

  describe("getTokenAmount", async () => {
    it("returns correct token amount", async () => {
      await token.approve(exchangeAddress, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let tokensOut = await exchange.getTokenAmount(toWei(1));
      expect(fromWei(tokensOut)).to.equal("1.978021978021978021");

      tokensOut = await exchange.getTokenAmount(toWei(100));
      expect(fromWei(tokensOut)).to.equal("180.0");

      tokensOut = await exchange.getTokenAmount(toWei(1000));
      expect(fromWei(tokensOut)).to.equal("990.0");
    });
  });

  describe("getEthAmount", async () => {
    it("returns correct ether amount", async () => {
      await token.approve(exchangeAddress, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      let ethOut = await exchange.getEthAmount(toWei(2));
      expect(fromWei(ethOut)).to.equal("0.98901098901098901");

      ethOut = await exchange.getEthAmount(toWei(100));
      expect(fromWei(ethOut)).to.equal("47.142857142857142857");

      ethOut = await exchange.getEthAmount(toWei(2000));
      expect(fromWei(ethOut)).to.equal("495.0");
    });
  });

  describe("ethToTokenTransfer", async () => {
    beforeEach(async () => {
      await token.approve(exchangeAddress, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("transfers at least min amount of tokens to recipient", async () => {
      const userBalanceBefore = await ethers.provider.getBalance(user.address);

      await exchange
        .connect(user)
        .ethToTokenTransfer(toWei(1.97), user.address, { value: toWei(1) });

      const userBalanceAfter = await ethers.provider.getBalance(user.address);
      expect(fromWei(userBalanceAfter - userBalanceBefore)).to.equal(
        "-1.000061817337699515"
      );

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("1.978021978021978021");

      const exchangeEthBalance = await ethers.provider.getBalance(
        exchangeAddress
      );
      expect(fromWei(exchangeEthBalance)).to.equal("1001.0");

      const exchangeTokenBalance = await token.balanceOf(exchangeAddress);
      expect(fromWei(exchangeTokenBalance)).to.equal("1998.021978021978021979");
    });
  });

  describe("ethToTokenSwap", async () => {
    beforeEach(async () => {
      await token.approve(exchangeAddress, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("transfers at least min amount of tokens", async () => {
      const userBalanceBefore = await ethers.provider.getBalance(user.address);

      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(1.97), { value: toWei(1) });

      const userBalanceAfter = await ethers.provider.getBalance(user.address);
      expect(fromWei(userBalanceAfter - userBalanceBefore)).to.equal(
        "-1.000061329520781205"
      );

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("1.978021978021978021");

      const exchangeEthBalance = await ethers.provider.getBalance(
        exchangeAddress
      );
      expect(fromWei(exchangeEthBalance)).to.equal("1001.0");

      const exchangeTokenBalance = await token.balanceOf(exchangeAddress);
      expect(fromWei(exchangeTokenBalance)).to.equal("1998.021978021978021979");
    });

    it("affects exchange rate", async () => {
      let tokensOut = await exchange.getTokenAmount(toWei(10));
      expect(fromWei(tokensOut)).to.equal("19.60396039603960396");

      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(9), { value: toWei(10) });

      tokensOut = await exchange.getTokenAmount(toWei(10));
      expect(fromWei(tokensOut)).to.equal("19.221490972626674432");
    });

    it("fails when output amount is less than min amount", async () => {
      await expect(
        exchange.connect(user).ethToTokenSwap(toWei(2), { value: toWei(1) })
      ).to.be.revertedWith("insufficient output amount");
    });

    it("allows zero swaps", async () => {
      await exchange
        .connect(user)
        .ethToTokenSwap(toWei(0), { value: toWei(0) });

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("0.0");

      const exchangeEthBalance = await ethers.provider.getBalance(
        exchangeAddress
      );
      expect(fromWei(exchangeEthBalance)).to.equal("1000.0");

      const exchangeTokenBalance = await token.balanceOf(exchangeAddress);
      expect(fromWei(exchangeTokenBalance)).to.equal("2000.0");
    });
  });

  describe("tokenToEthSwap", async () => {
    beforeEach(async () => {
      await ethers.provider.send("hardhat_setBalance", [
        owner.address,
        "0x152D02C7E14AF6800000",
      ]);
      await token.transfer(user.address, toWei(22));
      await token.connect(user).approve(exchangeAddress, toWei(22));

      await token.approve(exchangeAddress, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });
    });

    it("transfers at least min amount of tokens", async () => {
      const userBalanceBefore = await ethers.provider.getBalance(user.address);
      const exchangeBalanceBefore = await ethers.provider.getBalance(
        exchangeAddress
      );

      await exchange.connect(user).tokenToEthSwap(toWei(2), toWei(0.9));

      const userBalanceAfter = await ethers.provider.getBalance(user.address);
      expect(fromWei(userBalanceAfter - userBalanceBefore)).to.equal(
        "0.988951789622525172"
      );

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("20.0");

      const exchangeBalanceAfter = await ethers.provider.getBalance(
        exchangeAddress
      );
      expect(fromWei(exchangeBalanceAfter - exchangeBalanceBefore)).to.equal(
        "-0.98901098901098901"
      );

      const exchangeTokenBalance = await token.balanceOf(exchangeAddress);
      expect(fromWei(exchangeTokenBalance)).to.equal("2002.0");
    });

    it("affects exchange rate", async () => {
      let ethOut = await exchange.getEthAmount(toWei(20));
      expect(fromWei(ethOut)).to.equal("9.80198019801980198");
      await exchange.connect(user).tokenToEthSwap(toWei(20), toWei(9));
      ethOut = await exchange.getEthAmount(toWei(20));
      expect(fromWei(ethOut)).to.equal("9.610745486313337216");
    });

    it("fails when output amount is less than min amount", async () => {
      await expect(
        exchange.connect(user).tokenToEthSwap(toWei(2), toWei(1.0))
      ).to.be.revertedWith("insufficient output amount");
    });

    it("allows zero swaps", async () => {
      const userBalanceBefore = await ethers.provider.getBalance(user.address);
      await exchange.connect(user).tokenToEthSwap(toWei(0), toWei(0));

      const userBalanceAfter = await ethers.provider.getBalance(user.address);
      expect(fromWei(userBalanceAfter - userBalanceBefore)).to.equal(
        "-0.00004395501977975"
      );

      const userTokenBalance = await token.balanceOf(user.address);
      expect(fromWei(userTokenBalance)).to.equal("22.0");

      const exchangeEthBalance = await ethers.provider.getBalance(
        exchangeAddress
      );
      expect(fromWei(exchangeEthBalance)).to.equal("1000.0");

      const exchangeTokenBalance = await token.balanceOf(exchangeAddress);
      expect(fromWei(exchangeTokenBalance)).to.equal("2000.0");
    });
  });

  describe("tokenToTokenSwap", async () => {
    it("swaps token for token", async () => {
      const Factory = await ethers.getContractFactory("Factory");
      const Token = await ethers.getContractFactory("Token");

      const factory = await Factory.deploy();
      const token = await Token.deploy("TokenA", "AAA", toWei(1000000));
      const token2 = await Token.connect(user).deploy(
        "TokenB",
        "BBBB",
        toWei(1000000)
      );

      await factory.waitForDeployment();
      await token.waitForDeployment();
      await token2.waitForDeployment();

      const token1Address = await token.getAddress();
      const token2Address = await token2.getAddress();

      const exchange = await createExchange(
        factory,
        "LiqProvTokenAETH",
        "LpTknAEth",
        token1Address,
        owner
      );
      const exchange2 = await createExchange(
        factory,
        "LiqProvTokenBETH",
        "LpTknBEth",
        token2Address,
        user
      );

      const exchange1Address = await exchange.getAddress();
      const exchange2Address = await exchange2.getAddress();

      await token.approve(exchange1Address, toWei(2000));
      await exchange.addLiquidity(toWei(2000), { value: toWei(1000) });

      await token2.connect(user).approve(exchange2Address, toWei(1000));
      await exchange2
        .connect(user)
        .addLiquidity(toWei(1000), { value: toWei(1000) });

      expect(await token2.balanceOf(owner.address)).to.equal(0);

      await token.approve(exchange1Address, toWei(10));
      await exchange.tokenToTokenSwap(toWei(10), toWei(4.8), token2Address);

      expect(fromWei(await token2.balanceOf(owner.address))).to.equal(
        "4.852220406950839149"
      );

      expect(await token.balanceOf(user.address)).to.equal(0);

      await token2.connect(user).approve(exchange2Address, toWei(10));
      await exchange2
        .connect(user)
        .tokenToTokenSwap(toWei(10), toWei(19.5), token1Address);

      expect(fromWei(await token.balanceOf(user.address))).to.equal(
        "19.598200226978514386"
      );
    });
  });
});
