import React, { useState, useEffect } from "react";

export default function AllPunks() {
  const [uris, setUris] = useState([]);

  useEffect(() => {
    let tempUris = [];
    for (let i = 1; i < 26; i++) {
      tempUris.push({
        id: i,
        src: `https://jch.sfo3.digitaloceanspaces.com/doge-punks/punk${i}.png`,
      });
    }
    setUris(tempUris);
  }, [setUris]);

  return (
    <ul className="pt-8 grid gap-x-4 gap-y-8 grid-cols-5">
      {uris.map((uri) => (
        <li key={uri.id} className="relative">
          <div className="block w-full overflow-hidden bg-transparent rounded-lg filter drop-shadow-2xl pixelated group aspect-w-10 aspect-h-10 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-100 focus-within:ring-indigo-500">
            <img
              src={uri.src}
              alt=""
              className="object-cover pointer-events-none group-hover:opacity-75"
            />
          </div>
          <p className="block text-sm font-medium text-gray-500 pointer-events-none">
            Punk #{uri.id}
          </p>
        </li>
      ))}
    </ul>
  );
}
