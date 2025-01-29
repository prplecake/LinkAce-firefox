const StorageKeyPrefix = "lauinfo_";
export const _userInfo = null,
  _tags = [];
export enum StorageKeys {
  Checked = StorageKeyPrefix + "c",
  Name = StorageKeyPrefix + "n",
  AuthToken = StorageKeyPrefix + "_auth_token",
  Url = StorageKeyPrefix + "url",

  // config in the settings for not checking page pin state
  NoPing = StorageKeyPrefix + "np",
  // config in the settings for always check the private checkbox
  AllPrivate = StorageKeyPrefix + "allprivate",
  // config in the settings for disabling page action
  NoPageAction = StorageKeyPrefix + "nopageaction",
  // config in the settings for wrapping text with <blockquote>
  NoBlockquote = StorageKeyPrefix + "noblockquote",
  // config in the settings for reading later as default
  AllReadLater = StorageKeyPrefix + "allreadlater",
}

/*
 * The main API path. No trailing slash.
 */
export const mainPath = `${localStorage[StorageKeys.Url]}/api/v1/`;

export const yesIcon = {
    "18": "/images/icon-blue-18.png",
    "32": "/images/icon-blue-32.png",
    "36": "/images/icon-blue-36.png",
    "64": "/images/icon-blue-64.png"
  },
  noIcon = {
    "18": "/images/icon-gray-18.png",
    "32": "/images/icon-gray-32.png",
    "36": "/images/icon-gray-36.png",
    "64": "/images/icon-gray-64.png"
  },
  savingIcon = {
    "18": "/images/icon-gray-saving-18.png",
    "32": "/images/icon-gray-saving-32.png",
    "36": "/images/icon-gray-saving-36.png",
    "64": "/images/icon-gray-saving-64.png"
  };

export const REQ_TIME_OUT = 125 * 1000, maxDescLen = 500;


export const isBlockquote = function () {
  const noBlockquote = localStorage[StorageKeys.NoBlockquote];
  return typeof noBlockquote == "undefined" || noBlockquote === "false";
};
