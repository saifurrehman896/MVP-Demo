//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

/**
 * TokenLedger — the on-chain target that `server/contracts/TokenLedger.js`
 * simulates method-for-method, event-for-event, and revert-reason-for-revert-
 * reason.
 *
 * This file is the specification. The JS implementation is what the RentVerse
 * API actually executes, so the demo runs with no node, no wallet and no RPC.
 * When the platform is ready to move on-chain, deploy this, write an ethers
 * adapter with the same `read`/`write` pair as `SimulatedContractAdapter`, and
 * flip `LEDGER_ADAPTER` — no API or UI change required.
 */
contract TokenLedger {
    string public name;
    string public symbol;
    uint8 public decimals;
    address public owner;
    uint256 public totalSupply;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;
    mapping(address => bool) public isMinter;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed minter, address indexed to, uint256 value);
    event Burn(address indexed from, uint256 value);

    modifier onlyMinter() {
        require(isMinter[msg.sender], "caller is not a minter");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        owner = msg.sender;
        isMinter[msg.sender] = true;
    }

    // ── Views ───────────────────────────────────────────────────────────────

    function balanceOf(address _account) public view returns (uint256) {
        return balances[_account];
    }

    function allowance(address _owner, address _spender)
        public
        view
        returns (uint256)
    {
        return allowances[_owner][_spender];
    }

    // ── Transactions ────────────────────────────────────────────────────────

    function mint(address _to, uint256 _value) public onlyMinter {
        require(_to != address(0), "mint to the zero address");
        require(_value > 0, "amount must be greater than zero");

        totalSupply += _value;
        balances[_to] += _value;

        emit Transfer(address(0), _to, _value);
        emit Mint(msg.sender, _to, _value);
    }

    function transfer(address _to, uint256 _value) public returns (bool) {
        require(_to != address(0), "transfer to the zero address");
        require(_value > 0, "amount must be greater than zero");
        require(balances[msg.sender] >= _value, "transfer amount exceeds balance");

        balances[msg.sender] -= _value;
        balances[_to] += _value;

        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value) public returns (bool) {
        require(_spender != address(0), "approve to the zero address");

        allowances[msg.sender][_spender] = _value;

        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) public returns (bool) {
        require(_from != address(0), "transfer from the zero address");
        require(_to != address(0), "transfer to the zero address");
        require(_value > 0, "amount must be greater than zero");
        require(allowances[_from][msg.sender] >= _value, "insufficient allowance");
        require(balances[_from] >= _value, "transfer amount exceeds balance");

        allowances[_from][msg.sender] -= _value;
        balances[_from] -= _value;
        balances[_to] += _value;

        emit Transfer(_from, _to, _value);
        return true;
    }

    function burn(uint256 _value) public {
        require(_value > 0, "amount must be greater than zero");
        require(balances[msg.sender] >= _value, "burn amount exceeds balance");

        balances[msg.sender] -= _value;
        totalSupply -= _value;

        emit Transfer(msg.sender, address(0), _value);
        emit Burn(msg.sender, _value);
    }

    function addMinter(address _minter) public {
        require(msg.sender == owner, "caller is not the owner");
        isMinter[_minter] = true;
    }
}
