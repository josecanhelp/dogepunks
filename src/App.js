import React, {
  useEffect,
  Fragment,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { CheckIcon } from "@heroicons/react/solid";
import { Dialog, Transition } from "@headlessui/react";
import "./App.css";
import { StacksTestnet, StacksMainnet } from "@stacks/network";
import {
  AppConfig,
  UserSession,
  showConnect,
  openContractCall,
} from "@stacks/connect";
import {
  AnchorMode,
  FungibleConditionCode,
  PostConditionMode,
  callReadOnlyFunction,
  makeStandardSTXPostCondition,
  uintCV,
} from "@stacks/transactions";

const punkContractAddress = process.env.REACT_APP_PUNK_CONTRACT_ADDRESS;
const punkContractName = process.env.REACT_APP_PUNK_CONTRACT_NAME;
const currentAddressAtom = atomWithStorage("stacks-wallet-address", "");
const userDataAtom = atomWithStorage("user-data", {});
const urisAtom = atomWithStorage("uris", []);
const contractEnabledAtom = atomWithStorage("contract-enabled", false);
const staxios = axios.create({ baseURL: process.env.REACT_APP_NETWORK_URL });
const network =
  process.env.REACT_APP_NETWORK === "mainnet"
    ? new StacksMainnet()
    : new StacksTestnet({ url: "http://localhost:3999" });

export default function App() {
  const [userData, setUserData] = useAtom(userDataAtom);
  const [currentAddress, setCurrentAddress] = useAtom(currentAddressAtom);
  const [modalOpen, setModalOpen] = useState(false);
  const [latestTransactionId, setLatestTransactionId] = useState(null);
  const [lastId, setLastId] = useState(0);
  const [contactEnabled, setContractEnabled] = useAtom(contractEnabledAtom);
  const [uris, setUris] = useAtom(urisAtom);
  const cancelButtonRef = useRef(null);

  const appConfig = useMemo(() => {
    return new AppConfig(["store_write", "publish_data"]);
  }, []);

  const userSession = useMemo(() => {
    return new UserSession({ appConfig });
  }, [appConfig]);

  const getPunkList = useCallback(async () => {
    const all_assets = await staxios.get(
      `/extended/v1/address/${currentAddress}/assets?limit=50&offset=0`
    );

    const my_assets = all_assets.data.results
      .filter(
        (a) =>
          a.event_type === "non_fungible_token_asset" &&
          a.asset.asset_id ===
            "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.doge-punks-v1::doge-punks"
      )
      .map((a) => parseInt(a.asset.value.repr.substr(1)))
      .sort();

    const new_assets = my_assets.map(async (asset) => {
      return await callReadOnlyFunction({
        contractAddress: punkContractAddress,
        contractName: punkContractName,
        functionName: "get-token-uri",
        functionArgs: [uintCV(asset)],
        network: network,
        senderAddress: currentAddress,
      });
    });

    Promise.all(new_assets).then((res) =>
      setUris(res.map((a) => a.value.value.data))
    );
  }, [currentAddress, setUris]);

  useEffect(() => {
    async function fetchData() {
      const lastId = await callReadOnlyFunction({
        contractAddress: punkContractAddress,
        contractName: punkContractName,
        functionName: "get-last-token-id",
        functionArgs: [],
        network: network,
        senderAddress: currentAddress,
      });
      setLastId(lastId.value.value.words[0]);
    }
    fetchData();
    getPunkList();
  }, [currentAddress, getPunkList]);

  function authenticate() {
    showConnect({
      appDetails: {
        name: "DogePunks on Stacks",
        icon: window.location.origin + "/doge.png",
      },
      redirectTo: "/",
      onFinish: async () => {
        let userData = await userSession.loadUserData();
        setUserData(userData);
        if (process.env.REACT_APP_NETWORK === "mainnet") {
          setCurrentAddress(userData?.profile?.stxAddress?.mainnet);
        } else {
          setCurrentAddress(userData?.profile?.stxAddress?.testnet);
        }
        setTimeout(getPunkList, 1000);
      },
      userSession: userSession,
    });
  }

  const handleSignOut = useCallback(() => {
    userSession.signUserOut();
    setUserData({});
    setUris([]);
  }, [userSession, setUserData, setUris]);

  async function mintPunk() {
    const noncecall = await staxios.get(
      `/extended/v1/address/${currentAddress}/nonces`
    );
    const nonce = noncecall.data.possible_next_nonce;
    if (process.env.REACT_APP_NETWORK === "mainnet") {
      setCurrentAddress(userData?.profile?.stxAddress?.mainnet);
    } else {
      setCurrentAddress(userData?.profile?.stxAddress?.testnet);
    }
    await openContractCall({
      appDetails: {
        name: "DogePunks Mint",
        icon: window.location.origin + "/doge.png",
      },
      contractAddress: punkContractAddress,
      contractName: punkContractName,
      functionName: "claim",
      functionArgs: [],
      postConditionMode: PostConditionMode.Deny,
      postConditions: [
        makeStandardSTXPostCondition(
          currentAddress,
          FungibleConditionCode.LessEqual,
          uintCV(0).value
        ),
      ],
      network: network,
      nonce: nonce,
      anchorMode: AnchorMode.Any,
      onFinish: (result) => {
        setLatestTransactionId(result.txId);
        setModalOpen(true);
      },
    });
  }

  async function toggleContract() {
    const noncecall = await staxios.get(
      `/extended/v1/address/${currentAddress}/nonces`
    );
    const nonce = noncecall.data.possible_next_nonce;
    if (process.env.REACT_APP_NETWORK === "mainnet") {
      setCurrentAddress(userData?.profile?.stxAddress?.mainnet);
    } else {
      setCurrentAddress(userData?.profile?.stxAddress?.testnet);
    }
    await openContractCall({
      appDetails: {
        name: "DogePunks Toggle - Deployer Only",
        icon: window.location.origin + "/doge.png",
      },
      contractAddress: punkContractAddress,
      contractName: punkContractName,
      functionName: "toggle",
      functionArgs: [],
      network: network,
      nonce: nonce,
      anchorMode: AnchorMode.Any,
      onFinish: (result) => {
        setContractEnabled(!contactEnabled);
        setLatestTransactionId(result.txId);
      },
    });
  }

  function isWalletConnected() {
    return Object.keys(userData).length > 0;
  }

  function openTxPage() {
    let txid = latestTransactionId;
    if (process.env.REACT_APP_NETWORK === "mainnet") {
      txid = `0x${txid}`;
    }
    let url = `${process.env.REACT_APP_EXPLORER_URL}/txid/${txid}`;
    window.open(url, "_blank");
    setModalOpen(false);
  }

  function DogeCard(url) {
    return (
      <li key={url} className="relative py-8 list-decimal">
        <img
          src={url}
          alt=""
          className="object-cover w-24 h-24 pointer-events-none pixelated group-hover:opacity-75"
        />
      </li>
    );
  }

  return (
    <div className="min-h-screen bg-red-200">
      <div className="flex-col items-center justify-center px-4 py-12 mx-auto text-center max-w-7xl sm:px-6 lg:py-16 lg:px-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
          {isWalletConnected() ? (
            <span>Much Wow!</span>
          ) : (
            <span>such frendship</span>
          )}
        </h2>
        <img className="mx-auto" src="doge.png" alt="doge doggie"/>
        <div className="text-4xl">
          <span className="font-bold">{25 - lastId}</span>/25 DogePunks left
        </div>
        <div className="p-3">free.99</div>
        <div className="flex justify-center mt-8">
          <div className="inline-flex shadow rounded-md">
            {!isWalletConnected() ? (
              <button
                onClick={authenticate}
                type="button"
                className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
              >
                conekt
              </button>
            ) : (
              <button
                onClick={mintPunk}
                type="button"
                className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
              >
                mint
              </button>
            )}
          </div>

          {isWalletConnected() && (
            <div className="inline-flex ml-3">
              <button
                onClick={handleSignOut}
                type="button"
                className="inline-flex items-center justify-center px-5 py-3 text-base font-medium text-indigo-700 bg-indigo-100 border border-transparent rounded-md hover:bg-indigo-200"
              >
                sine out
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        {uris.length > 0 && (
          <div>
            <h2 className="text-3xl font-bold">my dogeies</h2>
            <ul>
              {uris.map((uri) => {
                return DogeCard(uri);
              })}
            </ul>
          </div>
        )}
      </div>
      <Transition.Root show={modalOpen} as={Fragment}>
        <Dialog
          as="div"
          className="fixed inset-0 z-10 overflow-y-auto"
          initialFocus={cancelButtonRef}
          onClose={setModalOpen}
        >
          <div className="flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Dialog.Overlay className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
            </Transition.Child>

            <span
              className="hidden sm:inline-block sm:align-middle sm:h-screen"
              aria-hidden="true"
            >
              &#8203;
            </span>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <div className="inline-block px-4 pt-5 pb-4 overflow-hidden text-left align-bottom bg-white rounded-lg shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                <div>
                  <div className="flex items-center justify-center w-12 h-12 mx-auto bg-green-100 rounded-full">
                    <CheckIcon
                      className="w-6 h-6 text-green-600"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-3 text-center sm:mt-5">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium text-gray-900 leading-6"
                    >
                      DogePunk Claim Initiated!
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        u haz to wait fur transaxun to finish.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                  <button
                    type="button"
                    className="inline-flex justify-center w-full px-4 py-2 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm"
                    onClick={openTxPage}
                  >
                    vew transactun
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center w-full px-4 py-2 mt-3 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                    onClick={() => setModalOpen(false)}
                    ref={cancelButtonRef}
                  >
                    go bak
                  </button>
                </div>
              </div>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>
      <div
        onClick={toggleContract}
        className="absolute bottom-0 right-0 p-4 text-sm font-light text-white"
      >
        &#120645;
      </div>
    </div>
  );
}
