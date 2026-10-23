export const arbitrationCaseProofVerifierAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "params_",
        "type": "address",
        "internalType": "contract IParamRegistry"
      },
      {
        "name": "protocolProof_",
        "type": "address",
        "internalType": "contract IProtocolProof"
      },
      {
        "name": "court_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "consume",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "taskId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "proofData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "verified",
        "type": "tuple",
        "internalType": "struct IArbitrationCaseProofVerifier.VerifiedCaseProof",
        "components": [
          {
            "name": "criterionIds",
            "type": "bytes32[]",
            "internalType": "bytes32[]"
          },
          {
            "name": "weightsBps",
            "type": "uint16[]",
            "internalType": "uint16[]"
          },
          {
            "name": "evidenceAsOf",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "excludedJurors",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "sourceJurors",
            "type": "address[]",
            "internalType": "address[]"
          },
          {
            "name": "sourceIds",
            "type": "bytes32[]",
            "internalType": "bytes32[]"
          },
          {
            "name": "evidenceHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
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
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "params",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IParamRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolProof",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IProtocolProof"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidEvidenceHash",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotCourt",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ProofDataOutOfBounds",
    "inputs": []
  }
];
