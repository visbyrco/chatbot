import type { ApiError } from "@repo/shared";
import { Text, View } from "react-native";

export default function App() {
  const placeholder: ApiError = {
    code: "NOT_IMPLEMENTED",
    message: "Android placeholder — wire to @repo/web API.",
  };

  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center" }}>
      <Text>chatbot Android (Expo placeholder)</Text>
      <Text style={{ marginTop: 8, opacity: 0.6 }}>
        API contracts from @repo/shared — {placeholder.code}
      </Text>
    </View>
  );
}
