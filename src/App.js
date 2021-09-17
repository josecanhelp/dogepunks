import React, { useEffect, useMemo, useCallback } from "react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import axios from "axios";
import { StacksTestnet, StacksMainnet } from "@stacks/network";
import { AppConfig, UserSession, showConnect } from "@stacks/connect";
import { callReadOnlyFunction, uintCV } from "@stacks/transactions";
import AllPunks from "./components/AllPunks";

const punkContractAddress = process.env.REACT_APP_PUNK_CONTRACT_ADDRESS;
const punkContractName = process.env.REACT_APP_PUNK_CONTRACT_NAME;
const currentAddressAtom = atomWithStorage("stacks-wallet-address", "");
const userDataAtom = atomWithStorage("user-data", {});
const urisAtom = atomWithStorage("uris", []);
const staxios = axios.create({ baseURL: process.env.REACT_APP_NETWORK_URL });
const network =
  process.env.REACT_APP_NETWORK === "mainnet"
    ? new StacksMainnet()
    : new StacksTestnet({ url: "http://localhost:3999" });

export default function App() {
  const [userData, setUserData] = useAtom(userDataAtom);
  const [currentAddress, setCurrentAddress] = useAtom(currentAddressAtom);
  const [uris, setUris] = useAtom(urisAtom);

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
            `${process.env.REACT_APP_PUNK_CONTRACT_ADDRESS}.doge-punks-v1::doge-punks`
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
    getPunkList();
  }, [getPunkList]);

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

  function isWalletConnected() {
    return Object.keys(userData).length > 0;
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
        <img className="mx-auto" src="doge.png" alt="doge doggie" />
        <a
          className="pt-24 text-sm font-light text-indigo-500 hover:text-white"
          href="https://explorer.stacks.co/txid/0x2e3f2fe40bc7e4ffaa7a8760d4f3ec94652587bdf82d9033059859f08303907e?chain=mainnet"
          target="_blank"
          rel="noreferrer"
        >
          View Contract Deployment
        </a>
        <div className="pt-12 text-4xl">Sold Out!</div>
        <AllPunks />
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
              <span></span>
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
        <div>
          <h2 className="text-3xl font-bold">my dogeies</h2>
          <ul>
            {uris.map((uri) => {
              return DogeCard(uri);
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
