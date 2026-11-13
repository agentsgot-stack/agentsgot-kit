export const arbitrationCourtAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "config",
        "type": "tuple",
        "internalType": "struct ArbitrationCourt.ConstructorConfig",
        "components": [
          {
            "name": "token",
            "type": "address",
            "internalType": "contract IERC20"
          },
          {
            "name": "params",
            "type": "address",
            "internalType": "contract IParamRegistry"
          },
          {
            "name": "validatorStaking",
            "type": "address",
            "internalType": "contract IValidatorStaking"
          },
          {
            "name": "testerAssignment",
            "type": "address",
            "internalType": "contract ITesterAssignment"
          },
          {
            "name": "pool",
            "type": "address",
            "internalType": "contract IArbitrationPool"
          },
          {
            "name": "settlement",
            "type": "address",
            "internalType": "contract IArbitrationSettlement"
          },
          {
            "name": "selection",
            "type": "address",
            "internalType": "contract IArbitrationSelection"
          },
          {
            "name": "voting",
            "type": "address",
            "internalType": "contract IArbitrationVoting"
          },
          {
            "name": "taskEscrow",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "governance",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "caseProofVerifier",
            "type": "address",
            "internalType": "contract IArbitrationCaseProofVerifier"
          },
          {
            "name": "arbitrationStream",
            "type": "address",
            "internalType": "contract IArbitrationStream"
          }
        ]
      }
    ],
    "stateMutability": "nonpayable"
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
    "name": "activateFallbackAdapter",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "advancePhase",
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
    "name": "appeal",
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
    "name": "appealBondOf",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
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
    "name": "arbitrationStream",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitrationStream"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "caseProgress",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "seedBlock",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "phaseDeadline",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "appealDeadline",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "confirmed",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "panelSize",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "caseProofVerifier",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitrationCaseProofVerifier"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "commitVote",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "commitments",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "commitVoteFor",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "commitments",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "confirmSeat",
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
    "name": "confirmSeatFor",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
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
    "name": "defaultRulingAt",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
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
    "name": "drawPanel",
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
    "name": "executeRuling",
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
    "name": "forceResolve",
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
    "name": "forceResolveAt",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
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
    "name": "forceResolveEpoch",
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
    "name": "governance",
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
    "name": "hasDebt",
    "inputs": [
      {
        "name": "executor",
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
    "name": "initializeV2",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "joinArbitrator",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "maxDisputeValue",
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
    "name": "onFallbackRuling",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "executorWins",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "openCase",
    "inputs": [
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
        "name": "reasonHash",
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
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "panel",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address[]",
        "internalType": "address[]"
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
    "name": "phaseOf",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "enum CourtTypes.Phase"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pool",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitrationPool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "prepareCase",
    "inputs": [
      {
        "name": "taskId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "taskValue",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "caseFee",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maintenance",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
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
    "name": "quoteCaseFee",
    "inputs": [
      {
        "name": "disputeValue",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "repayDebt",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "requiredPoolReserve",
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
    "name": "resolveStalledCase",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "executorWins",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revealVote",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "satisfied",
        "type": "bool[]",
        "internalType": "bool[]"
      },
      {
        "name": "reasonHashes",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revealVoteFor",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "satisfied",
        "type": "bool[]",
        "internalType": "bool[]"
      },
      {
        "name": "reasonHashes",
        "type": "bytes32[]",
        "internalType": "bytes32[]"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "rulingOf",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "ruling",
        "type": "uint8",
        "internalType": "enum IArbitrationCourt.Ruling"
      },
      {
        "name": "executorAwardBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "rulingHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "selection",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitrationSelection"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "settleDebt",
    "inputs": [
      {
        "name": "executor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "maximumAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "paid",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
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
        "internalType": "contract IArbitrationSettlement"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "tally",
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
    "name": "taskEscrow",
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
    "name": "token",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
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
    "name": "voting",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IArbitrationVoting"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "waiveAppeal",
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
    "name": "waiveAppealFor",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "party",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "AcceptWindowStarted",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "phaseDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AppealOpened",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "appellant",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "bond",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "seedBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AppealWaived",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "party",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AppealWindowStarted",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "appealDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CaseAwaitingPool",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "since",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CaseOpened",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "taskId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "publisher",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "executor",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "reasonHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CaseResolvedByDefault",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "executorWins",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CommitStarted",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "phaseDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CriteriaConfigured",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "criterionIds",
        "type": "bytes32[]",
        "indexed": false,
        "internalType": "bytes32[]"
      },
      {
        "name": "weightsBps",
        "type": "uint16[]",
        "indexed": false,
        "internalType": "uint16[]"
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
    "name": "JurorExcluded",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
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
    "name": "PanelDrawn",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": true,
        "internalType": "bool"
      },
      {
        "name": "panelSize",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "seed",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "jurors",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PanelRedrawRequested",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "redraws",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "seedBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PanelShrunk",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": true,
        "internalType": "bool"
      },
      {
        "name": "panelSize",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "jurors",
        "type": "address[]",
        "indexed": false,
        "internalType": "address[]"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RevealStarted",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "phaseDeadline",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoundInvalidated",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      },
      {
        "name": "invalidations",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RulingExecuted",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "ruling",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum IArbitrationCourt.Ruling"
      },
      {
        "name": "executorAwardBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RulingTallied",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "ruling",
        "type": "uint8",
        "indexed": false,
        "internalType": "enum IArbitrationCourt.Ruling"
      },
      {
        "name": "executorAwardBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "rulingHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "finalRound",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeatConfirmed",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "lockedAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SeedReselected",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "seedBlock",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SelectionEvidenceSubmitted",
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
        "indexed": false,
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
    "name": "StalledCaseResolved",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "executorWins",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
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
    "type": "event",
    "name": "VoteCommitted",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
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
    "name": "VoteRevealed",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "juror",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "satisfied",
        "type": "bool[]",
        "indexed": false,
        "internalType": "bool[]"
      },
      {
        "name": "reasonHashes",
        "type": "bytes32[]",
        "indexed": false,
        "internalType": "bytes32[]"
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
    "name": "AddressInsufficientBalance",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "AppealUnavailable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "CaseAlreadyExists",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "CaseNotFound",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "CaseNotStalled",
    "inputs": [
      {
        "name": "caseId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "CommitMismatch",
    "inputs": [
      {
        "name": "criterionIndex",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "InvalidAmount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidCriteria",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidExclusionsHash",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidSeedBlock",
    "inputs": [
      {
        "name": "seedBlock",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "currentBlock",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "PhaseMismatch",
    "inputs": [
      {
        "name": "current",
        "type": "uint8",
        "internalType": "enum CourtTypes.Phase"
      },
      {
        "name": "required",
        "type": "uint8",
        "internalType": "enum CourtTypes.Phase"
      }
    ]
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "SeatAlreadyConfirmed",
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
    "name": "SeatNotAssigned",
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
    "name": "Unauthorized",
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
    "name": "UpgradeUnauthorized",
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
    "name": "VoteAlreadySubmitted",
    "inputs": [
      {
        "name": "juror",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
];
