// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

interface IExchange {
    function addLiquidity(
        uint256 _tokenAmount
    ) external payable returns (uint256);

    function getReserve() external view returns (uint256);

    function getPrice(
        uint256 inputReserve,
        uint256 outputReserve
    ) external pure returns (uint256);

    function getTokenAmount(uint256 _ethSold) external view returns (uint256);

    function getEthAmount(uint256 _tokenSold) external view returns (uint256);

    function ethToTokenSwap(uint256 _minTokens) external payable;

    function tokenToEthSwap(uint256 _tokensSold, uint256 _minEth) external;

    function tokenToTokenSwap(
        uint256 _tokensSold,
        uint256 _minTokensBought,
        address _tokenAddress
    ) external;

    function removeLiquidity(
        uint256 _amount
    ) external returns (uint256, uint256);

    function ethToTokenTransfer(
        uint256 _minTokens,
        address _recipient
    ) external payable;
}
