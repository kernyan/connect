import initialState from './initialState';
import { currentOffset } from './playback';

const ACTION_UPDATE_SEGMENTS = 'update_segments';
const ACTION_LOAD_SEGMENT_METADATA = 'load_segment_metadata';
const ACTION_SEGMENT_METADATA = 'segment_metadata';

const SEGMENT_LENGTH = 1000 * 60;

/*
segments look like, but can contain additional data if they want
for example, caching url metadata
{
  route: 'dongleid|date',
  segment: 5
}
*/

function getCurrentSegment(state, o) {
  const offset = o === undefined ? currentOffset(state) : o;
  if (!state.segments) {
    return null;
  }

  const { segments } = state;

  for (let i = 0, len = segments.length; i < len; ++i) {
    const thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      break;
    }
    if (thisSegment.offset + thisSegment.duration > offset) {
      const segmentIndex = Math.floor((offset - thisSegment.offset) / SEGMENT_LENGTH);
      return {
        url: thisSegment.url,
        route: thisSegment.route,
        segment: segmentIndex,
        routeOffset: thisSegment.offset,
        startOffset: thisSegment.offset + segmentIndex * SEGMENT_LENGTH,
        routeFirstSegment: thisSegment.firstSegment,
        duration: thisSegment.duration,
        events: thisSegment.events,
        deviceType: thisSegment.deviceType,
        videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
        hpgps: thisSegment.hpgps,
        hasVideo: thisSegment.hasVideo,
        hasDriverCamera: thisSegment.hasDriverCamera,
        hasRLog: thisSegment.hasRLog,
        cameraStreamSegCount: thisSegment.cameraStreamSegCount,
        distanceMiles: thisSegment.distanceMiles,
      };
    }
  }
  return null;
}

function getNextSegment(state, o) {
  const offset = o === undefined ? currentOffset(state) : o;
  if (!state.segments) {
    return null;
  }

  const { segments } = state;

  for (let i = 0, len = segments.length; i < len; ++i) {
    const thisSegment = segments[i];
    // the next segment is after the offset, that means this offset is in a blank
    if (thisSegment.offset > offset) {
      return {
        url: thisSegment.url,
        route: thisSegment.route,
        segment: 0,
        routeOffset: thisSegment.offset,
        startOffset: thisSegment.offset,
        routeFirstSegment: thisSegment.firstSegment,
        events: thisSegment.events,
        videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
        deviceType: thisSegment.deviceType,
        hpgps: thisSegment.hpgps,
        hasVideo: thisSegment.hasVideo,
        hasDriverCamera: thisSegment.hasDriverCamera,
        hasRLog: thisSegment.hasRLog,
        cameraStreamSegCount: thisSegment.cameraStreamSegCount,
        distanceMiles: thisSegment.distanceMiles,
      };
      // already returned, unreachable code
      // break;
    }
    if (thisSegment.offset + thisSegment.duration > offset) {
      const segmentIndex = Math.floor((offset - thisSegment.offset) / SEGMENT_LENGTH);
      if (segmentIndex + 1 < thisSegment.segments) {
        return {
          url: thisSegment.url,
          route: thisSegment.route,
          segment: segmentIndex + 1,
          routeOffset: thisSegment.offset,
          startOffset: thisSegment.offset + (segmentIndex + 1) * SEGMENT_LENGTH,
          duration: thisSegment.duration,
          events: thisSegment.events,
          deviceType: thisSegment.deviceType,
          videoAvailableBetweenOffsets: thisSegment.videoAvailableBetweenOffsets,
          hpgps: thisSegment.hpgps,
          hasVideo: thisSegment.hasVideo,
          hasDriverCamera: thisSegment.hasDriverCamera,
          hasRLog: thisSegment.hasRLog,
          cameraStreamSegCount: thisSegment.cameraStreamSegCount,
          distanceMiles: thisSegment.distanceMiles,
        };
      }
    }
  }

  return null;
}

function finishSegment(segment) {
  let lastEngage = null;

  if (segment.hasVideo) {
    const vidAvail = segment.videoAvailableBetweenOffsets;
    let lastVideoRange = vidAvail[vidAvail.length - 1];
    if (!lastVideoRange) {
      lastVideoRange = [segment.offset, segment.offset + segment.duration];
    }
    segment.videoAvailableBetweenOffsets = [ // eslint-disable-line no-param-reassign
      ...vidAvail.slice(0, vidAvail.length - 1),
      [lastVideoRange[0], segment.offset + segment.duration]
    ];
  }
  segment.events = segment.events.sort((a, b) => { // eslint-disable-line no-param-reassign
    if (a.route_offset_millis === b.route_offset_millis) {
      return a.route_offset_nanos - b.route_offset_nanos;
    }
    return a.route_offset_millis - b.route_offset_millis;
  });
  segment.events.forEach((event) => {
    // NOTE sometimes theres 2 disengages in a row and that is NONSENSE
    switch (event.type) {
      case 'engage':
        lastEngage = event;
        break;
      case 'disengage':
        if (lastEngage) {
          lastEngage.data = {
            end_offset_nanos: event.offset_nanos,
            end_offset_millis: event.offset_millis,
            end_route_offset_nanos: event.route_offset_nanos,
            end_route_offset_millis: event.route_offset_millis
          };
        }
        break;
      default:
        break;
    }
  });
}

function segmentsFromMetadata(segmentsData) {
  let curSegment = null;
  let curVideoStartOffset = null;
  const segments = [];
  segmentsData.segments.forEach((segment) => {
    if (!segment.url) {
      return;
    }
    if (!(segment.proc_log === 40 || segment.proc_qlog === 40)) {
      return;
    }
    const segmentHasRLog = (segment.proc_log >= 0);
    const segmentHasDriverCamera = (segment.proc_dcamera >= 0);
    const segmentHasVideo = (segment.proc_camera >= 0);
    if (segmentHasVideo && curVideoStartOffset === null) {
      curVideoStartOffset = segment.offset;
    }
    /*
      route: '99c94dc769b5d96e|2018-04-09--11-29-08',
      offset: 41348000,
      duration: 214000,
      segments: 4
    */
    if (!curSegment || curSegment.route !== segment.canonical_route_name) {
      if (curSegment) {
        finishSegment(curSegment);
      }
      let { url } = segment;
      const parts = url.split('/');

      if (Number.isFinite(Number(parts.pop()))) {
        // url has a number at the end
        url = parts.join('/');
      }
      curSegment = {
        offset: segment.offset - (segment.segment * SEGMENT_LENGTH),
        firstSegment: segment.segment,
        route: segment.canonical_route_name,
        startTime: segment.start_time_utc_millis,
        startCoord: [segment.start_lng, segment.start_lat],
        duration: 0,
        segments: 0,
        url: url.replace('chffrprivate.blob.core.windows.net', 'chffrprivate-vzn.azureedge.net'),
        events: [],
        videoAvailableBetweenOffsets: [],
        hasVideo: segmentHasVideo,
        deviceType: segment.devicetype,
        hpgps: segment.hpgps,
        hasDriverCamera: segmentHasDriverCamera,
        hasRLog: segmentHasRLog,
        locStart: '',
        locEnd: '',
        distanceMiles: 0.0,
        cameraStreamSegCount: 0,
      };
      segments.push(curSegment);
    }
    if (curSegment.startCoord[0] === 0 && curSegment.startCoord[1] === 0) {
      curSegment.startCoord = [segment.start_lng, segment.start_lat];
    }
    if (!segmentHasVideo && curVideoStartOffset !== null) {
      curSegment.videoAvailableBetweenOffsets.push([curVideoStartOffset, segment.offset]);
      curVideoStartOffset = null;
    }
    curSegment.hasVideo = (curSegment.hasVideo || segmentHasVideo);
    curSegment.hasDriverCamera = (curSegment.hasDriverCamera || segmentHasDriverCamera);
    curSegment.hasRLog = (curSegment.hasRLog || segmentHasRLog);
    curSegment.hpgps = (curSegment.hpgps || segment.hpgps);
    curSegment.duration = (segment.offset - curSegment.offset) + segment.duration;
    curSegment.segments = Math.max(curSegment.segments, Number(segment.canonical_name.split('--').pop()) + 1);
    curSegment.events = curSegment.events.concat(segment.events);
    curSegment.distanceMiles += segment.length;
    curSegment.cameraStreamSegCount += Math.floor(segmentHasVideo);
    if (!curSegment.endCoord || segment.end_lng !== 0 || segment.end_lat !== 0) {
      curSegment.endCoord = [segment.end_lng, segment.end_lat];
    }
  });

  if (curSegment) {
    finishSegment(curSegment);
  }

  return segments;
}

function reducer(_state = initialState, action) {
  let state = { ..._state };
  switch (action.type) {
    case ACTION_LOAD_SEGMENT_METADATA:
      state = {
        ...state,
        segmentData: {
          promise: action.promise,
          start: action.start,
          end: action.end,
          dongleId: state.dongleId
        }
      };
      break;
    case ACTION_SEGMENT_METADATA:
      state = {
        ...state,
        segmentData: action.data,
        segments: action.segments
      };
      break;
    case ACTION_UPDATE_SEGMENTS:
      state = {
        ...state,
      }
    default:
      break;
  }
  const currentSegment = getCurrentSegment(state);
  const nextSegment = getNextSegment(state);

  if (currentSegment) {
    state.route = currentSegment.route;
    state.segment = currentSegment.segment;
  } else if (nextSegment) {
    state.route = nextSegment.route;
    state.segment = nextSegment.segment;
  } else {
    state.route = false;
    state.segment = 0;
  }

  state.currentSegment = currentSegment;
  state.nextSegment = nextSegment;

  return state;
}

function updateSegments() {
  return {
    type: ACTION_UPDATE_SEGMENTS
  };
}

function fetchSegmentMetadata(start, end, promise) {
  return {
    type: ACTION_LOAD_SEGMENT_METADATA,
    start,
    end,
    promise
  };
}

function insertSegmentMetadata(data) {
  return {
    type: ACTION_SEGMENT_METADATA,
    segments: segmentsFromMetadata(data),
    data
  };
}

function parseSegmentMetadata(state, _segments) {
  const routeStartTimes = {};
  let segments = _segments;
  segments = segments.map((_segment) => {
    const segment = _segment;
    segment.offset = Math.round(segment.start_time_utc_millis) - state.start;
    if (!routeStartTimes[segment.canonical_route_name]) {
      const segmentNum = Number(segment.canonical_name.split('--')[2]);
      segment.segment = segmentNum;
      routeStartTimes[segment.canonical_route_name] = segment.offset;
      if (segmentNum > 0) {
        routeStartTimes[segment.canonical_route_name] -= (SEGMENT_LENGTH * segmentNum);
      }
    }
    segment.routeOffset = routeStartTimes[segment.canonical_route_name];

    segment.duration = Math.round(segment.end_time_utc_millis - segment.start_time_utc_millis);
    segment.events = JSON.parse(segment.events_json) || [];
    const plannedDisengageEvents = segment.events.filter(
      (event) => event.type === 'alert' && event.data && event.data.should_take_control
    );

    segment.events.forEach((_event) => {
      const event = _event;
      event.timestamp = segment.start_time_utc_millis + event.offset_millis;
      // segment.start_time_utc_millis + event.offset_millis
      // segment.start_time_utc_millis - state.start + state.start

      event.canonical_segment_name = segment.canonical_name;

      if (event.data && event.data.is_planned) {
        let reason;

        const alert = plannedDisengageEvents.reduce((closestAlert, nextAlert) => {
          const closestAlertDiff = Math.abs(closestAlert.offset_millis - event.offset_millis);
          if (Math.abs(nextAlert.offset_millis - event.offset_millis) < closestAlertDiff) {
            return nextAlert;
          }
          return closestAlert;
        }, plannedDisengageEvents[0]);
        if (alert) {
          reason = alert.data.alertText2;
        } else {
          console.warn('Expected alert corresponding to planned disengagement', event);
          reason = 'Planned disengagement';
        }

        event.id = `planned_disengage_${event.time}`;
      }
    });
    return segment;
  });

  return {
    start: state.start,
    dongleId: state.dongleId,
    end: state.end,
    segments
  };
}

function hasSegmentMetadata(state) {
  if (!state) {
    return false;
  }
  if (state.devices && state.devices.length === 0 && !state.dongleId) {
    // new users without devices won't have segment metadata
    return true;
  }
  if (!state.segmentData) {
    console.log('No segment data at all');
    return false;
  }
  if (!state.segmentData.segments) {
    console.log('Still loading...');
    return false;
  }
  if (state.dongleId !== state.segmentData.dongleId) {
    console.log('Bad dongle id');
    return false;
  }
  if (state.start < state.segmentData.start) {
    console.log('Bad start offset');
    return false;
  }
  if (state.end > state.segmentData.end) {
    console.log('Bad end offset');
    return false;
  }

  return true;
}

function hasCameraAtOffset(segment, offset) {
  return segment.videoAvailableBetweenOffsets.some((int) => offset >= int[0] && offset <= int[1]);
}

const API = {
  // helpers
  getCurrentSegment,
  getNextSegment,
  hasSegmentMetadata,
  parseSegmentMetadata,
  hasCameraAtOffset,

  // actions
  updateSegments,
  fetchSegmentMetadata,
  insertSegmentMetadata,

  // constants
  SEGMENT_LENGTH,

  // reducer
  reducer
};
export default API;
