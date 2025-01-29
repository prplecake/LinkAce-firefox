export const getDefaultHeaders = (userInfo?: UserInfo, token?: string) => {
  let authHeader = "";
  if (userInfo) authHeader = `Bearer ${userInfo.authToken}`;
  if (token) authHeader = `Bearer ${token}`;
  if (!userInfo && !token) return undefined;
  return {
    Authorization: authHeader,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
};
