export const arbitrationProgressorAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "court_",
        "type": "address",
        "internalType": "contract IProgressableCourt"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "advanceCase",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "court",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IProgressableCourt"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  }
];
