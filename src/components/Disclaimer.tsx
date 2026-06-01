import { StyleSheet, Text, View } from "react-native";

export function Disclaimer() {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>
        Coverage, azimuth, and beamwidth visualization are high-precision estimations based on available Android
        telephony data and user-defined parameters. They are not absolute measurements.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#111F2A",
    borderColor: "#27485A",
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  text: {
    color: "#AAB7C4",
    fontSize: 12,
    lineHeight: 17
  }
});
