package com.hub900.entity;

import com.hub900.callback.*;
import com.hub900.a.*;
import java.math.*;

public class AntSpeedData extends AbstractData
{
    private long deviceId;
    private double speed;
    private long rssi;
    private int perimeter;
    
    public AntSpeedData(final byte[] bytes, final byte[] data, final AckBackCallback ackCallback, final DataErrorCallback errorCallback, final int perimeter) {
        super(bytes, data, ackCallback, errorCallback);
        this.perimeter = perimeter;
        try {
            final byte[] deviceIdByte = new byte[4];
            final long devi = d.f(data, 0, 2);
            System.arraycopy(data, 2, deviceIdByte, 0, 4);
            final long deviceIDIF = d.f(data, 1, 1) >> 4;
            if (devi == 0L || devi == 43981L) {
                if (deviceIDIF != 0L) {
                    final byte[] deviceIDByte = { d.n(d.b(deviceIDIF)), 0, 0 };
                    System.arraycopy(deviceIdByte, 2, deviceIDByte, 1, 2);
                    this.deviceId = d.f(deviceIDByte, 0, 3);
                }
            }
            else {
                this.deviceId = d.b(deviceIdByte);
            }
            final byte[] antPage = new byte[8];
            System.arraycopy(data, 6, antPage, 0, 8);
            final double SpeedCount = d.g(antPage, 0, 2);
            final double Timeint = d.g(antPage, 2, 2) / 1024.0;
            final String sID = this.deviceId + "s";
            double SpeedTime = 0.0;
            if (d.n.get(sID) != null) {
                SpeedTime = d.n.get(sID);
            }
            if (SpeedTime == 0.0) {
                d.n.put(sID, Timeint);
                d.o.put(sID, SpeedCount);
            }
            else {
                final double Speedcoun = d.o.get(sID);
                double Countin = 0.0;
                double Countdouble = 0.0;
                double SpeedSum = 0.0;
                double temporarytime = Timeint;
                double temporaryconut = SpeedCount;
                if (Speedcoun > temporaryconut) {
                    temporaryconut += 65533.0;
                }
                if (SpeedTime > temporarytime) {
                    temporarytime += 65533.0;
                }
                final double ifTimel = temporarytime - SpeedTime;
                if (ifTimel > 1.0) {
                    if (Speedcoun != SpeedCount || SpeedTime != Timeint) {
                        Countin = temporaryconut - Speedcoun;
                        Countdouble = Countin / ifTimel * perimeter * 3.6 / 1000.0;
                        final BigDecimal bd = new BigDecimal(Countdouble).setScale(1, 4);
                        SpeedSum = Double.valueOf(bd.toString());
                        if (SpeedSum == 0.0 && d.p.get(sID) != null) {
                            SpeedSum = d.p.get(sID);
                        }
                        d.p.put(sID, SpeedSum);
                        d.n.put(sID, Timeint);
                        d.o.put(sID, SpeedCount);
                        this.speed = SpeedSum;
                    }
                    else if (d.p.get(sID) != null) {
                        SpeedSum = d.p.get(sID);
                        this.speed = SpeedSum;
                    }
                }
                else if (d.p.get(sID) != null) {
                    SpeedSum = d.p.get(sID);
                    this.speed = SpeedSum;
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
    
    public double getSpeed() {
        return this.speed;
    }
    
    public void setSpeed(final double speed) {
        this.speed = speed;
    }
    
    public long getRssi() {
        return this.rssi;
    }
    
    public void setRssi(final long rssi) {
        this.rssi = rssi;
    }
    
    public long getDeviceId() {
        return this.deviceId;
    }
    
    public void setDeviceId(final long deviceId) {
        this.deviceId = deviceId;
    }
    
    public int getPerimeter() {
        return this.perimeter;
    }
    
    public void setPerimeter(final int perimeter) {
        this.perimeter = perimeter;
    }
    
    @Override
    public String toString() {
        return "AntSpeedData{deviceId=" + this.deviceId + ", speed=" + this.speed + ", rssi=" + this.rssi + ", perimeter=" + this.perimeter + '}';
    }
}
