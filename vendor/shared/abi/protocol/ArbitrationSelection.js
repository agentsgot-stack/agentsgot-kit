export const arbitrationSelectionAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "params_",
        "type": "address",
        "internalType": "contract IParamRegistry"
      },
      {
        "name": "agentRegistry_",
        "type": "address",
        "internalType": "contract IAgentRegistry"
      },
      {
        "name": "validatorStaking_",
        "type": "address",
        "internalType": "contract IValidatorStaking"
      },
      {
        "name": "testerAssignment_",
        "type": "address",
        "internalType": "contract ITesterAssignment"
      },
      {
        "name": "court_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "settlement_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "GOVERNANCE_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UPGRADER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "UPGRADE_INTERFACE_VERSION",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "string",
        "internalType": "string"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "agentRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAgentRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "arbitratorPoolSize",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "confirmations",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
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
    "name": "disciplineOf",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "overturnStreak",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minorityStreak",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "suspendedUntil",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "disqualified",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "drawWeight",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eligibleArbitratorCount",
    "inputs": [],
    "outputs": [
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "eligibleCountForCase",
    "inputs": [
      {
        "name": "context",
        "type": "tuple",
        "internalType": "struct IArbitrationSelection.CaseContext",
        "components": [
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
            "name": "publisher",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "executor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "taskValue",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "priorPanel",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "retainedPanel",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "count",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "evidenceHash",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fullScale",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fullScaleEligibleSince",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "inPool",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "invitations",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isExcluded",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "joinArbitrator",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
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
    "name": "previewCaseWeight",
    "inputs": [
      {
        "name": "context",
        "type": "tuple",
        "internalType": "struct IArbitrationSelection.CaseContext",
        "components": [
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
            "name": "publisher",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "executor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "taskValue",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "priorPanel",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "retainedPanel",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "proxiableUUID",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "recordConfirmation",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordEvidence",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
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
        "name": "suppliedHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordInvitation",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordOutcome",
    "inputs": [
      {
        "name": "panel",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "revealed",
        "type": "bool[]",
        "internalType": "bool[]"
      },
      {
        "name": "agreesWithFinal",
        "type": "bool[]",
        "internalType": "bool[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "recordOverturn",
    "inputs": [
      {
        "name": "firstPanel",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "firstMajority",
        "type": "bool[]",
        "internalType": "bool[]"
      },
      {
        "name": "overturned",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "responseRateBps",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "selectPanel",
    "inputs": [
      {
        "name": "context",
        "type": "tuple",
        "internalType": "struct IArbitrationSelection.CaseContext",
        "components": [
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
            "name": "publisher",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "executor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "taskValue",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "seed",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "size",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "priorPanel",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "retainedPanel",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "outputs": [
      {
        "name": "panel",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setArbitratorWhitelist",
    "inputs": [
      {
        "name": "accounts",
        "type": "address[]",
        "internalType": "address[]"
      },
      {
        "name": "whitelisted",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settlement",
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
    "name": "testerAssignment",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ITesterAssignment"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "updateScale",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "upgradeToAndCall",
    "inputs": [
      {
        "name": "newImplementation",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "data",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "validatorStaking",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IValidatorStaking"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "whitelistedArbitrator",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ArbitratorJoined",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ArbitratorWhitelistUpdated",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "whitelisted",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FullScaleChanged",
    "inputs": [
      {
        "name": "enabled",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FullScaleRecoveryStarted",
    "inputs": [
      {
        "name": "startedAt",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JurorDisqualified",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "alignedTestsCheckpoint",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JurorRecovered",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "JurorSuspended",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "suspendedUntil",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "overturnStreak",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MinorityStreakChanged",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "streak",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "activityBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SelectionEvidenceRecorded",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "evidenceAsOf",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Upgraded",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AddressEmptyCode",
    "inputs": [
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967InvalidImplementation",
    "inputs": [
      {
        "name": "implementation",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "ERC1967NonPayable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "FailedInnerCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "IneligibleJuror",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "InsufficientEligibleJurors",
    "inputs": [
      {
        "name": "available",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "required",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidEvidence",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
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
    "name": "NotGovernance",
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
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotSettlement",
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
    "name": "UUPSUnauthorizedCallContext",
    "inputs": []
  },
  {
    "type": "error",
    "name": "UUPSUnsupportedProxiableUUID",
    "inputs": [
      {
        "name": "slot",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "UpgradeUnauthorized",
    "inputs": [
      {
        "name": "caller",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
];
