export const usedDeviceInspectionGroups = [
  { title: 'used.identityOwnership', items: [
    ['imeiMatches', 'used.imeiMatches'], ['activationLockClear', 'used.activationLockClear'],
  ] },
  { title: 'used.networkConnectivity', items: [
    ['networkAndSim', 'used.networkAndSim'], ['wifi', 'used.wifi'], ['bluetooth', 'used.bluetooth'],
  ] },
  { title: 'used.hardware', items: [
    ['display', 'used.display'], ['touchscreen', 'used.touchscreen'], ['cameras', 'used.cameras'],
    ['microphone', 'used.microphone'], ['speakers', 'used.speakers'], ['chargingPort', 'used.chargingPort'],
    ['buttons', 'used.buttons'], ['biometrics', 'used.biometrics'],
  ] },
  { title: 'used.physicalBattery', items: [
    ['frameAndBack', 'used.frameAndBack'], ['waterDamageFree', 'used.waterDamageFree'], ['battery', 'used.battery'],
  ] },
] as const;
