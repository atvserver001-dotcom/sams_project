package com.hub900;

import java.util.*;
import com.hub900.callback.*;
import com.hub900.a.*;
import com.hub900.entity.*;

public final class HubManager
{
    private int perimeter;
    private long lastTime;
    private boolean isIdle;
    private int idleDuration;
    private static Timer timer;
    private static HubManager instance;
    private static final StringBuffer messageCache;
    private BleSOSCallback bleSOSCallback;
    private RawDataCallback rawDataCallback;
    private DataErrorCallback dataErrorCallback;
    private DataIdleCallback dataIdleCallback;
    private HeartBeatDataCallback heartBeatDataCallback;
    private AntHeartRateDataCallback antHeartRateDataCallback;
    private AntCadenceDataCallback antCadenceDataCallback;
    private BleCadenceDataCallback bleCadenceDataCallback;
    private AntSpeedDataCallback antSpeedDataCallback;
    private BleHeartRateDataCallback bleHeartRateDataCallback;
    private BleBoxingDataCallback bleBoxingDataCallback;
    private BleBoxingHeartRateDataCallback bleBoxingHeartRateDataCallback;
    private final DataIdleCallback mDataIdleCallback;
    
    public HubManager() {
        this.perimeter = 2340;
        this.lastTime = 0L;
        this.isIdle = false;
        this.idleDuration = 10000;
        this.mDataIdleCallback = new DataIdleCallback() {
            @Override
            public void onDataIdle() {
                final long time = System.currentTimeMillis();
                if (HubManager.this.lastTime != 0L && time - HubManager.this.lastTime > HubManager.this.idleDuration) {
                    HubManager.this.dataIdleCallback.onDataIdle();
                }
            }
        };
    }
    
    public static HubManager getInstance() {
        if (HubManager.instance == null) {
            synchronized (HubManager.class) {
                if (HubManager.instance == null) {
                    HubManager.instance = new HubManager();
                }
            }
        }
        return HubManager.instance;
    }
    
    public HubManager setIdleEnabled(final boolean idle) {
        this.isIdle = idle;
        if (this.isIdle) {
            try {
                (HubManager.timer = new Timer()).schedule(new a(this.mDataIdleCallback), this.idleDuration, this.idleDuration);
            }
            catch (Exception e) {
                final byte[] bytes = { 0 };
                if (this.dataErrorCallback != null) {
                    this.dataErrorCallback.onDataError(e.toString(), bytes);
                }
            }
        }
        else if (HubManager.timer != null) {
            HubManager.timer.cancel();
        }
        return this;
    }
    
    public HubManager setIdleDuration(final int idleDuration) {
        this.idleDuration = idleDuration;
        return this;
    }
    
    public synchronized void onDataReceived(final byte[] bytes, final AckBackCallback callback) {
        this.lastTime = System.currentTimeMillis();
        try {
            final String msg = d.v(bytes).replaceAll(" ", "");
            if (HubManager.messageCache.length() == 0 && !"7E".equals(msg.substring(0, 2))) {
                final byte[] newMessage = d.a(msg);
                int indexOf7e = 0;
                while (true) {
                    for (int i = 0, limit = newMessage.length; i < limit; ++i) {
                        if (newMessage[i] == 126) {
                            indexOf7e = i;
                            if (indexOf7e != 0) {
                                final byte[] copyBytes = new byte[newMessage.length - indexOf7e];
                                System.arraycopy(newMessage, indexOf7e, copyBytes, 0, newMessage.length - indexOf7e);
                                this.packingMessageCache(d.v(copyBytes), HubManager.messageCache);
                            }
                            return;
                        }
                    }
                    continue;
                }
            }
            if (!"7F".equals(msg.substring(msg.length() - 2))) {
                if ("7E".equals(msg.substring(0, 2))) {
                    HubManager.messageCache.setLength(0);
                }
                this.packingMessageCache(msg, HubManager.messageCache);
            }
            else {
                this.packingMessageCache(msg, HubManager.messageCache);
                final byte[] srcByte = d.a(HubManager.messageCache.toString());
                int indexOf7e2 = 0;
                boolean bol = false;
                for (int len = srcByte.length, i2 = 0; i2 < len; ++i2) {
                    if (srcByte[i2] == 126) {
                        indexOf7e2 = i2;
                        bol = true;
                    }
                    if (srcByte[i2] == 127 && bol) {
                        final byte[] destBytes = new byte[i2 - indexOf7e2 + 1];
                        System.arraycopy(srcByte, indexOf7e2, destBytes, 0, i2 - indexOf7e2 + 1);
                        bol = false;
                        if (this.rawDataCallback != null) {
                            this.rawDataCallback.onRawData(destBytes);
                        }
                        final byte[] content = com.hub900.a.a.d(destBytes);
                        if (com.hub900.a.a.c(content)) {
                            final byte[] mergeBytes = com.hub900.a.a.a(content);
                            if (this.isCheckNumValid(mergeBytes)) {
                                final int applicationDataLen = mergeBytes.length - 22;
                                int keyHeaderTotal = 0;
                                int mergeBytesSrcPos = 20;
                                int mergeBytesIndex = 20;
                                final int cmdTemp = b.a(mergeBytes[19]);
                                final int key = mergeBytes[mergeBytesIndex] & 0xFF;
                                switch (mergeBytes[19] & 0xFF) {
                                    case 1: {
                                        while (keyHeaderTotal < applicationDataLen) {
                                            final int keyHeader = ((mergeBytes[mergeBytesIndex + 1] & 0xFF) << 8) + (mergeBytes[mergeBytesIndex + 2] & 0xFF);
                                            mergeBytesIndex = mergeBytesIndex + 3 + keyHeader;
                                            keyHeaderTotal = keyHeaderTotal + keyHeader + 3;
                                            final int mergeBytesSrcPos2 = mergeBytesSrcPos + 2;
                                            if (key == 1) {
                                                final byte[] packetData = new byte[keyHeader];
                                                System.arraycopy(mergeBytes, mergeBytesSrcPos2 + 1, packetData, 0, keyHeader);
                                                int packetDataSrcPos = 0;
                                                int dataLen = 15;
                                                while (dataLen <= packetData.length) {
                                                    final byte[] data = new byte[15];
                                                    System.arraycopy(packetData, packetDataSrcPos, data, 0, 15);
                                                    packetDataSrcPos += 15;
                                                    dataLen += 15;
                                                    this.buildAntPacket(mergeBytes, data, callback);
                                                }
                                            }
                                        }
                                        break;
                                    }
                                    case 2: {
                                        while (keyHeaderTotal < applicationDataLen) {
                                            final int keyHeader2 = ((mergeBytes[mergeBytesIndex + 1] & 0xFF) << 8) + (mergeBytes[mergeBytesIndex + 2] & 0xFF);
                                            keyHeaderTotal = keyHeaderTotal + keyHeader2 + 3;
                                            final int mergeBytesSrcPos3 = mergeBytesSrcPos + 2;
                                            mergeBytesIndex = mergeBytesIndex + 3 + keyHeader2;
                                            if (key == 1) {
                                                final byte[] packetData2 = new byte[keyHeader2];
                                                System.arraycopy(mergeBytes, mergeBytesSrcPos3 + 1, packetData2, 0, keyHeader2);
                                                int packetDataSrcPos2 = 0;
                                                int bytesCount = 0;
                                                while (bytesCount < packetData2.length) {
                                                    final int bytesLen = (packetData2[packetDataSrcPos2] & 0xFF) + 1;
                                                    final byte[] data2 = new byte[bytesLen];
                                                    System.arraycopy(packetData2, packetDataSrcPos2, data2, 0, bytesLen);
                                                    packetDataSrcPos2 += bytesLen;
                                                    bytesCount += data2.length;
                                                    this.buildBlePacket(mergeBytes, data2, callback);
                                                }
                                            }
                                            mergeBytesSrcPos = mergeBytesSrcPos3 + keyHeader2 + 1;
                                        }
                                        break;
                                    }
                                    case 4: {
                                        while (keyHeaderTotal < applicationDataLen) {
                                            final int keyHeader3 = ((mergeBytes[mergeBytesIndex + 1] & 0xFF) << 8) + (mergeBytes[mergeBytesIndex + 2] & 0xFF);
                                            keyHeaderTotal = keyHeaderTotal + keyHeader3 + 3;
                                            final int mergeBytesSrcPos4 = mergeBytesSrcPos + 2;
                                            mergeBytesIndex = mergeBytesIndex + 3 + keyHeader3;
                                            if (key == 1) {
                                                final byte[] packetData3 = new byte[keyHeader3];
                                                System.arraycopy(mergeBytes, mergeBytesSrcPos4 + 1, packetData3, 0, keyHeader3);
                                                final HeartBeatData beatData = new HeartBeatData(mergeBytes, packetData3, callback, this.dataErrorCallback);
                                                if (this.heartBeatDataCallback != null) {
                                                    this.heartBeatDataCallback.onHeartBeatData(beatData);
                                                }
                                            }
                                            mergeBytesSrcPos = mergeBytesSrcPos4 + keyHeader3 + 1;
                                        }
                                        break;
                                    }
                                }
                            }
                            else if (this.dataErrorCallback != null) {
                                this.dataErrorCallback.onDataError("Verification error !!!", mergeBytes);
                            }
                        }
                        else if (this.dataErrorCallback != null) {
                            this.dataErrorCallback.onDataError("Abnormal data !!!", content);
                        }
                    }
                }
                HubManager.messageCache.setLength(0);
            }
        }
        catch (Exception e) {
            if (this.dataErrorCallback != null) {
                this.dataErrorCallback.onDataError(e.toString(), bytes);
            }
            HubManager.messageCache.setLength(0);
        }
    }
    
    private StringBuffer packingMessageCache(final String in, final StringBuffer messageCache2) {
        messageCache2.append(in);
        return messageCache2;
    }
    
    private synchronized boolean isCheckNumValid(final byte[] mergeBytes) {
        final long checkSum = d.f(mergeBytes, mergeBytes.length - 2, 2);
        final byte[] srPage = new byte[mergeBytes.length - 2];
        System.arraycopy(mergeBytes, 0, srPage, 0, mergeBytes.length - 2);
        final int sum1 = d.B(srPage);
        final long ifCheck = d.a(sum1);
        return checkSum == ifCheck;
    }
    
    private synchronized void buildAntPacket(final byte[] mergeBytes, final byte[] data, final AckBackCallback callback) {
        switch (b.a(data[0])) {
            case 120: {
                if (this.antHeartRateDataCallback != null) {
                    this.antHeartRateDataCallback.onAntHeartRateData(new AntHeartRateData(mergeBytes, data, callback, this.dataErrorCallback));
                    break;
                }
                break;
            }
            case 122: {
                if (this.antCadenceDataCallback != null) {
                    this.antCadenceDataCallback.onAntCadenceData(new AntCadenceDta(mergeBytes, data, callback, this.dataErrorCallback));
                    break;
                }
                break;
            }
            case 123: {
                if (this.antSpeedDataCallback != null) {
                    this.antSpeedDataCallback.onAntSpeedData(new AntSpeedData(mergeBytes, data, callback, this.dataErrorCallback, this.perimeter));
                    break;
                }
                break;
            }
        }
    }
    
    private synchronized void buildBlePacket(final byte[] bytes, final byte[] data, final AckBackCallback callback) {
        final int bleLen = data[0] & 0xFF;
        if (bleLen > 10) {
            final int advType = b.a(data[5]);
            switch (advType) {
                case 161:
                case 162: {
                    if (this.bleHeartRateDataCallback != null) {
                        this.bleHeartRateDataCallback.onBleHeartRateData(new BleHeartRateData(bytes, data, callback, this.dataErrorCallback));
                        break;
                    }
                    break;
                }
                case 164: {
                    if (this.bleBoxingDataCallback != null) {
                        this.bleBoxingDataCallback.onBleBoxingData(new BleBoxingData(bytes, data, callback, this.dataErrorCallback));
                        break;
                    }
                    break;
                }
                case 165: {
                    if (this.bleBoxingHeartRateDataCallback != null) {
                        this.bleBoxingHeartRateDataCallback.onBleBoxingHeartRateData(new BleBoxingHeartRateData(bytes, data, callback, this.dataErrorCallback));
                        break;
                    }
                    break;
                }
                default: {
                    if (data[6] == 13 && data[7] == 24) {
                        if (this.bleHeartRateDataCallback != null) {
                            this.bleHeartRateDataCallback.onBleHeartRateData(new BleHeartRateData(bytes, data, callback, this.dataErrorCallback, this.bleSOSCallback));
                            break;
                        }
                        break;
                    }
                    else {
                        if (data[6] == 22 && data[7] == 24 && this.bleCadenceDataCallback != null) {
                            this.bleCadenceDataCallback.onBleCadenceData(new BleCadenceDta(bytes, data, callback, this.dataErrorCallback));
                            break;
                        }
                        break;
                    }
                    break;
                }
            }
        }
    }
    
    public HubManager setBleSOSCallback(final BleSOSCallback callback) {
        this.bleSOSCallback = callback;
        return this;
    }
    
    public HubManager setRawDataCallback(final RawDataCallback callback) {
        this.rawDataCallback = callback;
        return this;
    }
    
    public HubManager setHeartBeatDataCallback(final HeartBeatDataCallback callback) {
        this.heartBeatDataCallback = callback;
        return this;
    }
    
    public HubManager setAntHeartRateDataCallback(final AntHeartRateDataCallback callback) {
        this.antHeartRateDataCallback = callback;
        return this;
    }
    
    public HubManager setAntCadenceDataCallback(final AntCadenceDataCallback callback) {
        this.antCadenceDataCallback = callback;
        return this;
    }
    
    public HubManager setBleCadenceDataCallback(final BleCadenceDataCallback callback) {
        this.bleCadenceDataCallback = callback;
        return this;
    }
    
    public HubManager setAntSpeedDataCallback(final AntSpeedDataCallback callback) {
        this.antSpeedDataCallback = callback;
        return this;
    }
    
    public HubManager setBleHeartRateDataCallback(final BleHeartRateDataCallback callback) {
        this.bleHeartRateDataCallback = callback;
        return this;
    }
    
    public HubManager setBleBoxingDataCallback(final BleBoxingDataCallback callback) {
        this.bleBoxingDataCallback = callback;
        return this;
    }
    
    public HubManager setBleBoxingHeartRateDataCallback(final BleBoxingHeartRateDataCallback callback) {
        this.bleBoxingHeartRateDataCallback = callback;
        return this;
    }
    
    public HubManager setErrorDataCallback(final DataErrorCallback callback) {
        this.dataErrorCallback = callback;
        return this;
    }
    
    public HubManager setDataIdleCallback(final DataIdleCallback callback) {
        this.dataIdleCallback = callback;
        return this;
    }
    
    public HubManager setPerimeter(final int perimeter) {
        this.perimeter = perimeter;
        return this;
    }
    
    static {
        HubManager.instance = null;
        messageCache = new StringBuffer();
    }
    
    private static class a extends TimerTask
    {
        private final DataIdleCallback b;
        
        public a(final DataIdleCallback callback) {
            this.b = callback;
        }
        
        @Override
        public void run() {
            if (this.b != null) {
                this.b.onDataIdle();
            }
        }
    }
}
