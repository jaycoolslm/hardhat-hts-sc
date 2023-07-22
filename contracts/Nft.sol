// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.12 <0.9.0;

import "./HederaResponseCodes.sol";
import "./HederaTokenService.sol";
import "./ExpiryHelper.sol";
import "./KeyHelper.sol";

// Import Ownable from the OpenZeppelin Contracts library
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
// import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

// Expiry Helper extends FeeHelper which extends KeyHelper inherits HederaStokeService
// Ownable from OZ to limit access control

contract Nft is KeyHelper, ExpiryHelper, Ownable {
    // using EnumerableSet for EnumerableSet.AddressSet;

    // // List of trusted addresses which can mint tokens
    // EnumerableSet.AddressSet private _allowanceWL;

    event TokenCreated(address indexed tokenAddress);

    event TokenControllerMessage(
        string msgType,
        address indexed fromAddress,
        int64 amount,
        string message
    );

    // mapping of token address to metadata
    mapping(address => bytes[]) public tokenMetadata;

	// to avoid serialisation related default causing odd behaviour
	// implementing custom object as a wrapper
	struct FTFixedFeeObject {
		int64 amount;
        address tokenAddress;
        bool useHbarsForPayment;
        bool useCurrentTokenForPayment;
        address feeCollector;
	}

	struct FTFractionalFeeObject {
		int64 numerator;
		int64 denominator;
		address feeCollector;
		int64 minimumAmount;
        int64 maximumAmount;
        bool netOfTransfers;
	}

    // create a fungible Token with no custom fees,
    // with calling contract as admin key
    // add a wipe key in order to allow implmentation of burn function
    // => no additional mint, no pause
    /// @param name token name
    /// @param symbol token symbol
    /// @param memo token longer form description as a string
    /// @param maxSupply Set to 0 for an infinite token, set > 0 to enforce capped suply @ maxSupply
    /// @param metadata array of bytes containing metadata for the token
    /// @return createdTokenAddress the address of the new token
    function createNft(
        // bytes memory ed25519Key,
        string memory name,
        string memory symbol,
        string memory memo,
        int64 maxSupply,
        bytes[] memory metadata
    ) 
		external 
		payable  
		onlyOwner 
	returns (address) {
        // instantiate the list of keys we'll use for token create
        IHederaTokenService.TokenKey[]
            memory keys = new IHederaTokenService.TokenKey[](1);

        keys[0] = getSingleKey(KeyType.SUPPLY, KeyValueType.CONTRACT_ID, address(this));

        // define the token
        IHederaTokenService.HederaToken memory token;
        token.name = name;
        token.symbol = symbol;
        token.memo = memo;
        token.treasury = address(this);
        token.tokenKeys = keys;

        if (maxSupply > 0) {
            token.tokenSupplyType = true;
            token.maxSupply = maxSupply;
        }

        // create the expiry schedule for the token using ExpiryHelper
        token.expiry = createAutoRenewExpiry(
            address(this),
            HederaTokenService.defaultAutoRenewPeriod
        );

        // call HTS precompiled contract, passing initial supply and decimals
        (int responseCode, address tokenAddress) = HederaTokenService
            .createNonFungibleToken(token);

        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("mint wipe key failed");
        }
        // add the metadata to the mapping
        tokenMetadata[tokenAddress] = metadata;
        // Emit the event with the created token address
        emit TokenCreated(tokenAddress);

        return tokenAddress;
    }

    /// Transfer token from this contract to the recipient
    /// @param token address in EVM format of the token to transfer
    /// @param amount number of tokens to send (in long form adjusted for decimal)
    function mintAndTransfer(
        address token,
        int64 amount
    ) 
		external
        payable 
    {
        // require msg value greater than 1 hbar
        if (msg.value < 1 * 10 ** 8) {
            revert("Insufficient funds");
        }
        // require token exists
        if (tokenMetadata[token].length == 0) {
            revert("Token not found");
        }
        // mint single nft
        bytes[] memory metadata = tokenMetadata[token];
        (int responseCode, , int64[] memory serialNumbers) = HederaTokenService.mintToken(token, amount, metadata);
        if (responseCode != HederaResponseCodes.SUCCESS) {
            revert("Mint failed");
        }
        // transfer the newly minted nft
        IERC721(token).transferFrom(address(this), msg.sender, SafeCast.toUint256(serialNumbers[0]));

        emit TokenControllerMessage("Transfer", msg.sender, amount, "complete");
    }

    // allows the contract top recieve HBAR
    receive() external payable {
        emit TokenControllerMessage(
            "Receive",
            msg.sender,
            SafeCast.toInt64(SafeCast.toInt256(msg.value)),
            "Hbar received"
        );
    }

    fallback() external payable {
        emit TokenControllerMessage(
            "Fallback",
            msg.sender,
            SafeCast.toInt64(SafeCast.toInt256(msg.value)),
            "Hbar received"
        );
    }
}
