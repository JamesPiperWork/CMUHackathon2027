import { createContext, useContext } from "react";

export const ScreenScrollContext = createContext<() => void>(() => {});

export const useScreenScroll = () => useContext(ScreenScrollContext);
