import {
  ACTION_SELECT_DEVICE,
  ACTION_SELECT_TIME_RANGE,
  ACTION_STARTUP_DATA,
  ACTION_UPDATE_DEVICES,
  ACTION_UPDATE_DEVICE,
  ACTION_PRIME_NAV,
  ACTION_PRIME_SUBSCRIPTION,
  ACTION_PRIME_SUBSCRIBE_INFO,
  ACTION_UPDATE_DEVICE_ONLINE,
} from '../actions/types';
import { emptyDevice } from '../../utils';

const initialState = {};

function populateFetchedAt(d) {
  return {
    ...d,
    fetched_at: parseInt(Date.now() / 1000),
  };
}

export default function reducer(_state = initialState, action) {
  let state = { ..._state };
  let deviceIndex = null;
  switch (action.type) {
    case ACTION_STARTUP_DATA:
      let devices = action.devices.map(populateFetchedAt);
      if (!state.dongleId && devices.length > 0) {
        state = {
          ...state,
          dongleId: devices[0].dongle_id,
          device: devices[0]
        };
      } else {
        state = {
          ...state,
          device: devices.find((device) => device.dongle_id === state.dongleId)
        };
        if (!state.device) {
          state.device = {
            ...emptyDevice,
            dongle_id: state.dongleId,
          };
        }
      }
      state.devices = devices;
      state.profile = action.profile;
      break;
    case ACTION_SELECT_DEVICE:
      state = {
        ...state,
        dongleId: action.dongleId,
        primeNav: false,
        subscription: null,
      };
      if (state.devices) {
        state.device = state.devices.find((device) => device.dongle_id === action.dongleId);
      }
      if (state.segmentData && state.segmentData.dongleId !== state.dongleId) {
        state.segmentData = null;
        state.segments = [];
      }
      break;
    case ACTION_SELECT_TIME_RANGE:
      state = {
        ...state,
        start: action.start,
        end: action.end,
        segmentData: null,
        segments: [],
      };
      break;
    case ACTION_UPDATE_DEVICES:
      state = {
        ...state,
        devices: action.devices.map(populateFetchedAt),
      };
      if (state.dongleId) {
        state.device = state.devices.find((d) => d.dongle_id === state.dongleId);
        if (!state.device) {
          state.device = {
            ...emptyDevice,
          };
        }
      }
      break;
    case ACTION_UPDATE_DEVICE:
      state = {
        ...state,
        devices: [...state.devices],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.device.dongle_id);
      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = populateFetchedAt(action.device);
      } else {
        state.devices.unshift(populateFetchedAt(action.device));
      }
      break;
    case ACTION_UPDATE_DEVICE_ONLINE:
      state = {
        ...state,
        devices: [...state.devices],
      };
      deviceIndex = state.devices.findIndex((d) => d.dongle_id === action.dongleId);

      if (deviceIndex !== -1) {
        state.devices[deviceIndex] = {
          ...state.devices[deviceIndex],
          last_athena_ping: action.last_athena_ping,
          fetched_at: action.fetched_at,
        };
      }

      if (state.device.dongle_id === action.dongleId) {
        state.device = {
          ...state.device,
          last_athena_ping: action.last_athena_ping,
          fetched_at: action.fetched_at,
        };
      }
      break;
    case ACTION_PRIME_NAV:
      state = {
        ...state,
        primeNav: action.primeNav,
      };
      break;
    case ACTION_PRIME_SUBSCRIPTION:
      if (action.dongleId != state.dongleId) { // ignore outdated info
        break;
      }
      state = {
        ...state,
        subscription: action.subscription,
      };
      break;
    case ACTION_PRIME_SUBSCRIBE_INFO:
      if (action.dongleId != state.dongleId) {
        break;
      }
      state = {
        ...state,
        subscribeInfo: action.subscribeInfo,
      };
      break;
    default:
      return state;
  }
  return state;
}
