package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;
import java.math.*;

public class AntCadenceDta extends AbstractData
{
    private long cadence;
    private long deviceId;
    private int rssi;
    
    public AntCadenceDta(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback) {
        super(bytes, data, ackCallback, errorCallback);
        try {
            final byte[] deviceID = new byte[4];
            final long devi = d.f(data, 0, 2);
            System.arraycopy(data, 2, deviceID, 0, 4);
            final long deviceIDIF = d.f(data, 1, 1) >> 4;
            if (devi == 0L || devi == 43981L) {
                if (deviceIDIF != 0L) {
                    final byte[] deviceIDByte = { d.n(d.b(deviceIDIF)), 0, 0 };
                    System.arraycopy(deviceID, 2, deviceIDByte, 1, 2);
                    this.deviceId = d.f(deviceIDByte, 0, 3);
                }
            }
            else {
                this.deviceId = d.b(deviceID);
            }
            final byte[] antPage = new byte[8];
            System.arraycopy(data, 6, antPage, 0, 8);
            double TimeInt = d.g(antPage, 0, 2) / 1024.0;
            double CountInt = d.g(antPage, 2, 2);
            final String cID = this.deviceId + "c";
            double CadenceTime = 0.0;
            if (d.n.get(cID) != null) {
                CadenceTime = d.n.get(cID);
            }
            if (CadenceTime == 0.0) {
                d.n.put(cID, TimeInt);
                d.o.put(cID, CountInt);
            }
            else {
                final double Cadencecount = d.o.get(cID);
                double Countin = 0.0;
                double Countdouble = 0.0;
                long CountSum = 0L;
                if (Cadencecount > CountInt) {
                    CountInt += 65533.0;
                }
                if (CadenceTime > TimeInt) {
                    TimeInt += 65533.0;
                }
                final double ifTimel = TimeInt - CadenceTime;
                if (ifTimel > 1.0) {
                    if (Cadencecount != CountInt || CadenceTime != TimeInt) {
                        Countin = CountInt - Cadencecount;
                        Countdouble = Countin / ifTimel * 60.0;
                        final BigDecimal bd = new BigDecimal(Countdouble).setScale(0, 4);
                        CountSum = Long.parseLong(bd.toString());
                        if (CountSum == 0L && d.q.get(cID) != null) {
                            CountSum = d.q.get(cID);
                        }
                        d.q.put(cID, CountSum);
                        d.n.put(cID, TimeInt);
                        d.o.put(cID, CountInt);
                        this.cadence = CountSum;
                    }
                    else if (d.q.get(cID) != null) {
                        CountSum = d.q.get(cID);
                        this.cadence = CountSum;
                    }
                }
                else if (d.q.get(cID) != null) {
                    CountSum = d.q.get(cID);
                    this.cadence = CountSum;
                }
            }
            this.rssi = (data[data.length - 1] & 0xFF) - 256;
        }
        catch (Exception e) {
            if (errorCallback != null) {
                errorCallback.onDataError("AntCadenceDta:" + e.getMessage(), data);
            }
        }
    }
    
    public int getRssi() {
        return this.rssi;
    }
    
    public void setRssi(final int rssi) {
        this.rssi = rssi;
    }
    
    public long getCadence() {
        return this.cadence;
    }
    
    public void setCadence(final long cadence) {
        this.cadence = cadence;
    }
    
    public long getDeviceId() {
        return this.deviceId;
    }
    
    public void setDeviceId(final long deviceId) {
        this.deviceId = deviceId;
    }
    
    @Override
    public String toString() {
        return "AntCadenceDta{cadence=" + this.cadence + ", deviceId=" + this.deviceId + ", rssi=" + this.rssi + '}';
    }
}
