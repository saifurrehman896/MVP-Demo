<!-- ⚠️ Best viewed in VS Code Markdown Preview -->
<!-- In GitHub this file may look unformatted or misaligned -->

<div align="center" style="font-size:28px; font-weight:700; color:#4ec9b0;">
✨ RentVerse ✨
</div>

---

<div align="center" style="font-size:18px; font-weight:700; color:#aaaaaa;">
RentVerse is a modern real estate investment platform that combines traditional property investing with cryptocurrency payments. Built with React and Tailwind CSS, it mirrors the functionality of Arrived.com while adding blockchain-based transaction capabilities.
</div>

---
![Dashboard Overview](public/home.jpg)
---

# 🌐 RentVerse Demo
---

RentVerse is a demo platform showcasing a next-generation real-estate experience powered by cryptocurrency payments, interactive 3D property visualization, and a fully responsive, component-driven architecture.

---

## ✨ Key Features

- 💱 Cryptocurrency-enabled property transactions  
- 📱 Mobile-responsive interface  
- 🔍 SEO-optimized architecture  
- 📊 Real-time market data integration  
- 🏡 Interactive 3D property visualization  
- 🔗 Smart contract integration for secure blockchain transactions  

---

![Dashboard Overview](public/client.png)
---

## 🧩 Core Pages and Components

### 1. 🏠 Home Page
- Hero section with value proposition  
- Featured properties grid  
- “Why Choose Us” crypto benefits section  
- Step-by-step investment guide  
- Latest blog previews  
- Community section  

### 2. 🏘️ Properties Page
- Searchable and filterable property grid  
- Advanced search options  
- Detailed property cards  
- Three.js-powered 3D viewer  

### 3. 👥 About Us Page
- Mission and vision overview  
- Team member profiles  
- Platform statistics and milestones  

### 4. ✍️ Blog Section
- Category-based filtering  
- Blog search functionality  
- Author profiles  
- Social sharing options  

### 5. 🪙 Token Ledger (`/token-ledger`)
- Live ERC-20-style token contract running **in-process — no blockchain dependency**  
- Mint, transfer, approve, transferFrom and burn, each with a real receipt  
- Block height, gas usage, event logs and revert reasons  
- Balances held as BigInt base units, so token math never touches a float  

---

## 🪙 Token Ledger API

A working token contract and REST API that models smart-contract behaviour
without a node, a wallet or an RPC endpoint. The API talks to the contract
through a `read`/`write` adapter, so pointing RentVerse at a real deployed
ERC-20 later is a one-file change with no route or UI churn.

```bash
# balances
curl -s http://127.0.0.1:3099/api/ledger/balance/treasury

# mint 5000 RVT to alice
curl -s -X POST http://127.0.0.1:3099/api/ledger/mint \
  -H 'Content-Type: application/json' \
  -d '{"to":"alice","amount":"5000"}'

# transfer
curl -s -X POST http://127.0.0.1:3099/api/ledger/transfer \
  -H 'Content-Type: application/json' \
  -d '{"from":"alice","to":"bob","amount":"1250.5"}'
```

Full endpoint reference, design notes and configuration:
[`server/contracts/README.md`](server/contracts/README.md).
The Solidity specification it mirrors: [`contracts/TokenLedger.sol`](contracts/TokenLedger.sol).

Run the contract test suite:

```
   npm run test:contracts
```

---

## 🧱 Development Guidelines

### 🧩 Component Standards
- Follow atomic design principles  
- Use TypeScript for type safety  
- Apply Tailwind breakpoints for responsiveness  
- Add comments and maintain documentation  

### 🔧 State Management
- React Context for shared global state  
- Redux for complex or multi-layered data flows  
- Minimal local component state  

### 🔐 Security Practices
- Validate all user inputs  
- Secure wallet connection handling  
- Follow blockchain transaction best practices  
- Run regular dependency and security audits  

---

## 🤝 Contributing

We welcome contributions! Please follow the workflow below:

1. 📌 Create a new feature branch  
2. 🧪 Write tests for added functionality  
3. 📝 Document new or updated features  
4. 🎯 Maintain consistent coding style  
5. 🔁 Submit a pull request with a clear description  

---

## 🙏 Acknowledgments

Inspired by Arrived.com and supported by the open-source work of the React and Tailwind CSS communities.

---

# How to run the project

## Clone

```
   git clone https://github.com/klasma-tech/MVP_demo.git
```

## Change directory

```
   cd MVP_demo
```

## Install dependencies

```
   npm install
```

## Run on localhost

```
   npm start
```
