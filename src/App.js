import React, { Fragment, useState, useMemo, useCallback } from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import {
  ChevronRightIcon,
  RefreshIcon,
  CheckIcon,
} from "@heroicons/react/solid";
import { Dialog, Transition } from "@headlessui/react";
import { XIcon } from "@heroicons/react/outline";
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
  NonFungibleConditionCode,
  PostConditionMode,
  callReadOnlyFunction,
  makeStandardSTXPostCondition,
  makeStandardNonFungiblePostCondition,
  standardPrincipalCV,
  uintCV,
  createAssetInfo,
} from "@stacks/transactions";

const punkContractAddress = process.env.REACT_APP_PUNK_CONTRACT_ADDRESS;
const punkContractName = process.env.REACT_APP_PUNK_CONTRACT_NAME;
const currentAddressAtom = atomWithStorage("stacks-wallet-address", "");
const userDataAtom = atomWithStorage("user-data", {});
const staxios = axios.create({ baseURL: "http://localhost:3999" });
const network =
  process.env.REACT_APP_NETWORK === "mainnet"
    ? new StacksMainnet()
    : new StacksTestnet({ url: "http://localhost:3999" });

export default function App() {
  const [userData, setUserData] = useAtom(userDataAtom);
  const [currentAddress, setCurrentAddress] = useAtom(currentAddressAtom);
  const [recipientAddress, setRecipientAddress] = useState(null);
  const [punkList, setPunkList] = useState([]);
  const [pendingPunkList, setPendingPunkList] = useState([]);
  const [selectedPunk, setSelectedPunk] = useState(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [latestTransactionId, setLatestTransactionId] = useState(null);

  const appConfig = useMemo(() => {
    return new AppConfig(["store_write", "publish_data"]);
  }, []);

  const userSession = useMemo(() => {
    return new UserSession({ appConfig });
  }, [appConfig]);

  function authenticate() {
    showConnect({
      appDetails: {
        name: "StacksPunks Minter",
        icon: window.location.origin + "/logo.png",
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
    setPunkList([]);
  }, [userSession, setUserData, setPunkList]);

  async function mintPunk() {
    const noncecall = await staxios.get(
      `/extended/v1/address/${currentAddress}/nonces`
    );
    const nonce = noncecall.data.possible_next_nonce;
    const arg = uintCV(0);
    const cost = uintCV(30000000).value;
    setCurrentAddress(userData?.profile?.stxAddress?.testnet);
    await openContractCall({
      appDetails: {
        name: "StacksPunks Minter",
        icon: window.location.origin + "/logo.png",
      },
      contractAddress: punkContractAddress,
      contractName: punkContractName,
      functionName: "mint",
      functionArgs: [arg],
      postConditionMode: PostConditionMode.Deny,
      postConditions: [
        makeStandardSTXPostCondition(
          currentAddress,
          FungibleConditionCode.LessEqual,
          cost
        ),
      ],
      network: network,
      nonce: nonce,
      anchorMode: AnchorMode.Any,
      onFinish: (result) => {
        console.log(result.txId);
      },
    });
  }

  async function getPunkList() {
    const result = await callReadOnlyFunction({
      contractAddress: punkContractAddress,
      contractName: punkContractName,
      functionName: "get-punks-entry-by-owner",
      functionArgs: [standardPrincipalCV(currentAddress)],
      network: network,
      senderAddress: currentAddress,
    });
    setPunkList(result.data.ids.list);
  }

  async function transferPunk(punkId) {
    await openContractCall({
      appDetails: {
        name: "StacksPunks Transfer",
        icon: window.location.origin + "/logo.png",
      },
      contractAddress: punkContractAddress,
      contractName: punkContractName,
      functionName: "transfer",
      functionArgs: [
        uintCV(punkId),
        standardPrincipalCV(currentAddress),
        standardPrincipalCV(recipientAddress),
      ],
      validateWithAbi: true,
      postConditionMode: PostConditionMode.Deny,
      postConditions: [
        makeStandardNonFungiblePostCondition(
          currentAddress,
          NonFungibleConditionCode.DoesNotOwn,
          createAssetInfo(punkContractAddress, punkContractName, process.env.REACT_APP_PUNK_ASSET_NAME),
          uintCV(punkId)
        ),
      ],
      network: network,
      anchorMode: AnchorMode.Any,
      onFinish: (result) => {
        console.log(result.txId);
        closeFlyout();
        setLatestTransactionId(result.txId);
        setModalOpen(true);
        setPendingPunkList(pendingPunkList.concat(selectedPunk));
      },
    });
    console.log(`transfer punk #${punkId} to ${recipientAddress}`);
  }

  function isWalletConnected() {
    return Object.keys(userData).length > 0;
  }

  function selectPunk(punk) {
    setSelectedPunk(punk);
    setFlyoutOpen(true);
  }

  function closeFlyout() {
    setFlyoutOpen(false);
    setSelectedPunk(null);
    setRecipientAddress(null);
  }

  function openTxPage() {
    let txid = latestTransactionId;
    if (process.env.REACT_APP_NETWORK === "mainnet") {
      txid = `0x${txid}`;
    }
    let url = `${process.env.REACT_APP_EXPLORER_URL}/txid/${txid}`;
    window.open(url, "_blank");
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="py-12 md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-gray-900 leading-7 sm:text-3xl sm:truncate">
            StacksPunks Transfer Tool
          </h2>
          <h1>They're my punks and I can do what I want with them.</h1>
        </div>
        <div className="flex mt-4 md:mt-0 md:ml-4">
          {isWalletConnected() && (
            <div>
              {process.env.REACT_APP_NETWORK === "devnet" && (
                <button
                  onClick={mintPunk}
                  type="button"
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Mint
                </button>
              )}
              <button
                onClick={getPunkList}
                type="button"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <RefreshIcon
                  className="w-5 h-5 text-gray-400"
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
          {!isWalletConnected() ? (
            <button
              onClick={authenticate}
              type="button"
              className="inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Connect Wallet
            </button>
          ) : (
            <button
              onClick={handleSignOut}
              type="button"
              className="inline-flex items-center px-4 py-2 ml-3 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      {isWalletConnected() && (
        <div>
          <Transition.Root show={modalOpen} as={Fragment}>
            <Dialog
              as="div"
              className="fixed inset-0 z-10 overflow-y-auto"
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

                {/* This element is to trick the browser into centering the modal contents. */}
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
                  <div className="inline-block px-4 pt-5 pb-4 overflow-hidden text-left align-bottom bg-white rounded-lg shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-sm sm:w-full sm:p-6">
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
                          Transfer Initiated!
                        </Dialog.Title>
                      </div>
                    </div>
                    <div className="mt-5 ">
                      <button
                        type="button"
                        className="inline-flex justify-center w-full px-4 py-2 mt-3 mb-3 text-base font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm"
                        onClick={openTxPage}
                      >
                        View Transaction
                      </button>
                      <button
                        type="button"
                        className="inline-flex justify-center w-full px-4 py-2 text-base font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                        onClick={() => setModalOpen(false)}
                      >
                        Go back to dashboard
                      </button>
                    </div>
                  </div>
                </Transition.Child>
              </div>
            </Dialog>
          </Transition.Root>
          <Transition.Root show={flyoutOpen} as={Fragment}>
            <Dialog
              as="div"
              className="fixed inset-0 overflow-hidden"
              onClose={closeFlyout}
            >
              <div className="absolute inset-0 overflow-hidden">
                <Dialog.Overlay className="absolute inset-0" />

                <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
                  <Transition.Child
                    as={Fragment}
                    enter="transform transition ease-in-out duration-500 sm:duration-700"
                    enterFrom="translate-x-full"
                    enterTo="translate-x-0"
                    leave="transform transition ease-in-out duration-500 sm:duration-700"
                    leaveFrom="translate-x-0"
                    leaveTo="translate-x-full"
                  >
                    <div className="w-screen max-w-2xl">
                      <form className="flex flex-col h-full overflow-y-scroll bg-white shadow-xl">
                        <div className="flex-1">
                          {/* Header */}
                          <div className="px-4 py-6 bg-gray-50 sm:px-6">
                            <div className="flex items-start justify-between space-x-3">
                              <div className="space-y-1">
                                <Dialog.Title className="text-lg font-medium text-gray-900">
                                  {selectedPunk && (
                                    <span>
                                      Punk #{selectedPunk.value.words[0]}
                                    </span>
                                  )}
                                </Dialog.Title>
                                <p className="text-sm text-gray-500">
                                  If you'd like to transfer this punk to another
                                  account, enter the recipient's address below.
                                </p>
                              </div>
                              <div className="flex items-center h-7">
                                <button
                                  type="button"
                                  className="text-gray-400 hover:text-gray-500"
                                  onClick={closeFlyout}
                                >
                                  <span className="sr-only">Close panel</span>
                                  <XIcon
                                    className="w-6 h-6"
                                    aria-hidden="true"
                                  />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Divider container */}
                          <div className="py-6 space-y-6 sm:py-0 sm:space-y-0 sm:divide-y sm:divide-gray-200">
                            {/* Recipient Address */}
                            {selectedPunk && (
                              <div className="flex flex-col items-center justify-center p-4">
                                <img
                                  className="w-48 h-48 pixelated"
                                  src={`https://www.stackspunks.com/assets/punks/punk${selectedPunk.value.words[0]}.png`}
                                  alt=""
                                />
                                <div>Punk #{selectedPunk.value.words[0]}</div>
                              </div>
                            )}
                            <div className="px-4 space-y-1 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 sm:py-5">
                              <div>
                                <label
                                  htmlFor="recipient-address"
                                  className="block text-sm font-medium text-gray-900 sm:mt-px sm:pt-2"
                                >
                                  Recipient Address
                                </label>
                              </div>
                              <div className="sm:col-span-2">
                                <input
                                  type="text"
                                  name="recipient-address"
                                  id="recipient-address"
                                  onChange={(e) =>
                                    setRecipientAddress(e.target.value)
                                  }
                                  className="block w-full border-gray-300 shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex-shrink-0 px-4 py-5 border-t border-gray-200 sm:px-6">
                          <div className="flex justify-end space-x-3">
                            <button
                              type="button"
                              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                              onClick={closeFlyout}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() =>
                                transferPunk(selectedPunk.value.words[0])
                              }
                              type="button"
                              className="inline-flex justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent shadow-sm rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              Initiate Transfer
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </Transition.Child>
                </div>
              </div>
            </Dialog>
          </Transition.Root>
          <div className="overflow-hidden bg-white shadow sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {punkList.map((punk) => (
                <li key={punk.value.words[0]}>
                  <button
                    className="block w-full hover:bg-gray-50"
                    onClick={() => selectPunk(punk)}
                  >
                    <div className="flex items-center px-4 py-4 sm:px-6">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <img
                            className="w-24 h-24 pixelated"
                            src={`https://www.stackspunks.com/assets/punks/punk${punk.value.words[0]}.png`}
                            alt=""
                          />
                        </div>
                        <div className="items-center flex-1 min-w-0 px-4 md:grid md:grid-cols-2 md:gap-4">
                          <p className="text-sm font-medium text-indigo-600 truncate">
                            Punk #{punk.value.words[0]}
                          </p>
                          <div className="hidden text-green-400 md:block"></div>
                        </div>
                      </div>
                      <div>
                        <ChevronRightIcon
                          className="w-5 h-5 text-gray-400"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!isWalletConnected() && (
        <div className="relative py-16 bg-white">
          <div
            className="absolute inset-x-0 top-0 hidden h-1/2 bg-gray-50 lg:block"
            aria-hidden="true"
          />
          <div className="mx-auto bg-indigo-600 max-w-7xl lg:bg-transparent lg:px-8">
            <div className="lg:grid lg:grid-cols-12">
              <div className="relative z-10 lg:col-start-1 lg:row-start-1 lg:col-span-4 lg:py-16 lg:bg-transparent">
                <div
                  className="absolute inset-x-0 h-1/2 bg-gray-50 lg:hidden"
                  aria-hidden="true"
                />
                <div className="max-w-md px-4 mx-auto sm:max-w-3xl sm:px-6 lg:max-w-none lg:p-0">
                  <div className="aspect-w-10 aspect-h-6 sm:aspect-w-2 sm:aspect-h-1 lg:aspect-w-1">
                    <img
                      className="object-cover object-center shadow-2xl rounded-3xl"
                      src="punks.png"
                      alt=""
                    />
                  </div>
                </div>
              </div>

              <div className="relative bg-indigo-600 lg:col-start-3 lg:row-start-1 lg:col-span-10 lg:rounded-3xl lg:grid lg:grid-cols-10 lg:items-center">
                <div
                  className="absolute inset-0 hidden overflow-hidden rounded-3xl lg:block"
                  aria-hidden="true"
                >
                  <svg
                    className="absolute bottom-full left-full transform translate-y-1/3 -translate-x-2/3 xl:bottom-auto xl:top-0 xl:translate-y-0"
                    width={404}
                    height={384}
                    fill="none"
                    viewBox="0 0 404 384"
                    aria-hidden="true"
                  >
                    <defs>
                      <pattern
                        id="64e643ad-2176-4f86-b3d7-f2c5da3b6a6d"
                        x={0}
                        y={0}
                        width={20}
                        height={20}
                        patternUnits="userSpaceOnUse"
                      >
                        <rect
                          x={0}
                          y={0}
                          width={4}
                          height={4}
                          className="text-indigo-500"
                          fill="currentColor"
                        />
                      </pattern>
                    </defs>
                    <rect
                      width={404}
                      height={384}
                      fill="url(#64e643ad-2176-4f86-b3d7-f2c5da3b6a6d)"
                    />
                  </svg>
                  <svg
                    className="absolute top-full transform -translate-y-1/3 -translate-x-1/3 xl:-translate-y-1/2"
                    width={404}
                    height={384}
                    fill="none"
                    viewBox="0 0 404 384"
                    aria-hidden="true"
                  >
                    <defs>
                      <pattern
                        id="64e643ad-2176-4f86-b3d7-f2c5da3b6a6d"
                        x={0}
                        y={0}
                        width={20}
                        height={20}
                        patternUnits="userSpaceOnUse"
                      >
                        <rect
                          x={0}
                          y={0}
                          width={4}
                          height={4}
                          className="text-indigo-500"
                          fill="currentColor"
                        />
                      </pattern>
                    </defs>
                    <rect
                      width={404}
                      height={384}
                      fill="url(#64e643ad-2176-4f86-b3d7-f2c5da3b6a6d)"
                    />
                  </svg>
                </div>
                <div className="relative max-w-md px-4 py-12 mx-auto space-y-6 sm:max-w-3xl sm:py-16 sm:px-6 lg:max-w-none lg:p-0 lg:col-start-4 lg:col-span-6">
                  <h2
                    className="text-3xl font-extrabold text-white"
                    id="join-heading"
                  >
                    Transfer a punk to someone else. I mean... it is your punk!
                  </h2>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
