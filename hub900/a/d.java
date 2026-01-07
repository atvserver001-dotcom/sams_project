package com.hub900.a;

import java.io.*;
import java.util.*;

public class d
{
    private static String m;
    public static Map<String, Double> n;
    public static Map<String, Double> o;
    public static Map<String, Double> p;
    public static Map<String, Long> q;
    
    public static String f(final String str) {
        final byte[] bytes = str.getBytes();
        final StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (int i = 0; i < bytes.length; ++i) {
            sb.append(d.m.charAt((bytes[i] & 0xF0) >> 4));
            sb.append(d.m.charAt(bytes[i] & 0xF));
        }
        return sb.toString();
    }
    
    public static String g(final String bytes) {
        final ByteArrayOutputStream baos = new ByteArrayOutputStream(bytes.length() / 2);
        for (int i = 0; i < bytes.length(); i += 2) {
            baos.write(d.m.indexOf(bytes.charAt(i)) << 4 | d.m.indexOf(bytes.charAt(i + 1)));
        }
        return new String(baos.toByteArray());
    }
    
    public static String h(final String hex) {
        final StringBuilder sb = new StringBuilder();
        final StringBuilder sb2 = new StringBuilder();
        for (int i = 0; i < hex.length() - 1; i += 2) {
            final String s = hex.substring(i, i + 2);
            final int decimal = Integer.parseInt(s, 16);
            sb.append((char)decimal);
            sb2.append(decimal);
        }
        return sb.toString();
    }
    
    public static String u(final byte[] bytes) {
        final String hexStr = "0123456789ABCDEF";
        String result = "";
        String hex = "";
        final byte[] var4 = bytes;
        for (int var5 = bytes.length, var6 = 0; var6 < var5; ++var6) {
            final byte b = var4[var6];
            hex = String.valueOf(hexStr.charAt((b & 0xF0) >> 4));
            hex += String.valueOf(hexStr.charAt(b & 0xF));
            result = result + hex + " ";
        }
        return result;
    }
    
    public static String v(final byte[] bArray) {
        final StringBuffer sb = new StringBuffer(bArray.length);
        for (int i = 0; i < bArray.length; ++i) {
            final String sTemp = Integer.toHexString(0xFF & bArray[i]);
            if (sTemp.length() < 2) {
                sb.append(0);
            }
            sb.append(sTemp.toUpperCase());
        }
        return sb.toString();
    }
    
    public static byte[] a(final String src) {
        final byte[] ret = new byte[src.length() / 2];
        final byte[] tmp = src.getBytes();
        for (int i = 0; i < src.length() / 2; ++i) {
            ret[i] = a(tmp[i * 2], tmp[i * 2 + 1]);
        }
        return ret;
    }
    
    private static byte a(final byte src0, final byte src1) {
        byte _b0 = Byte.decode("0x" + new String(new byte[] { src0 }));
        _b0 <<= 4;
        final byte _b2 = Byte.decode("0x" + new String(new byte[] { src1 }));
        final byte ret = (byte)(_b0 ^ _b2);
        return ret;
    }
    
    public static String b(final byte msg) {
        final String str = Integer.toHexString(0xFF & msg);
        return ((str.length() < 2) ? ("0" + str) : str).toUpperCase();
    }
    
    public static int a(final byte b, final int i) {
        final int bit = b >> i & 0x1;
        return bit;
    }
    
    public static int a(final byte b, final int start, final int length) {
        final int bit = b >> start & 255 >> 8 - length;
        return bit;
    }
    
    public static int w(final byte[] keyLen) {
        final String h = Integer.toHexString(keyLen[0] & 0x1);
        if (h.length() == 1) {
            new StringBuilder().append("0").append(h).toString();
        }
        final String lo = Integer.toHexString(keyLen[1] & 0xFF);
        if (lo.length() == 1) {
            new StringBuilder().append("0").append(lo).toString();
        }
        return (keyLen[0] & 0x1) * 256 + (keyLen[1] & 0xFF);
    }
    
    public static int b(final byte[] b) {
        return (b[3] & 0xFF) | (b[2] & 0xFF) << 8 | (b[1] & 0xFF) << 16 | (b[0] & 0xFF) << 24;
    }
    
    public static int x(final byte[] b) {
        return (b[1] & 0xFF) | (b[0] & 0xFF) << 8;
    }
    
    public static long y(final byte[] b) {
        return (b[1] & 0xFF) | (b[0] & 0xFF) << 8;
    }
    
    public static int c(final byte b) {
        return b & 0xFF;
    }
    
    public static String i(final String value) {
        final StringBuffer sbu = new StringBuffer();
        final char[] chars = value.toCharArray();
        for (int i = 0; i < chars.length; ++i) {
            if (i != chars.length - 1) {
                sbu.append(chars[i]).append(",");
            }
            else {
                sbu.append(chars[i]);
            }
        }
        return sbu.toString();
    }
    
    public static String j(final String hex) {
        final StringBuilder sb = new StringBuilder();
        final StringBuilder temp = new StringBuilder();
        for (int i = 0; i < hex.length() - 1; i += 2) {
            final String output = hex.substring(i, i + 2);
            final int decimal = Integer.parseInt(output, 16);
            sb.append((char)decimal);
            temp.append(decimal);
        }
        return sb.toString();
    }
    
    public static String z(final byte[] mac) {
        String macStr = "";
        for (int m = 0; m < mac.length; ++m) {
            if (m == mac.length - 1) {
                macStr += b(mac[m]);
            }
            else {
                macStr = macStr + b(mac[m]) + ":";
            }
        }
        return macStr;
    }
    
    public static boolean k(final String str) {
        return null == str || str.length() == 0;
    }
    
    public static String l(final String hubda) {
        final String sustr = hubda.substring(2, hubda.length());
        final String sust = sustr.substring(0, sustr.lastIndexOf("7F") - 4);
        return sust;
    }
    
    public static long a(final int sum) {
        final int nam = 0 - sum;
        final int neu = nam ^ 0x3A3A;
        String hex = hex = Integer.toHexString(neu).toUpperCase();
        final String SumStr = hex.substring(hex.length() - 4, hex.length());
        final byte[] sumByte = a(SumStr);
        return f(sumByte, 0, 2);
    }
    
    public static String A(final byte[] bArray) {
        final String[] binaryArray = { "0000", "0001", "0010", "0011", "0100", "0101", "0110", "0111", "1000", "1001", "1010", "1011", "1100", "1101", "1110", "1111" };
        String outStr = "";
        int pos = 0;
        for (final byte b : bArray) {
            pos = (b & 0xF0) >> 4;
            outStr += binaryArray[pos];
            pos = (b & 0xF);
            outStr += binaryArray[pos];
        }
        return outStr;
    }
    
    public static String m(final String str) {
        final String[] strs = str.split("\\s+");
        String result = "";
        for (final String string : strs) {
            final String hex = Integer.toString(Integer.parseInt(string, 2), 16);
            result += hex;
        }
        return result;
    }
    
    public static int B(final byte[] srPage) {
        int sum = 0;
        for (int i1 = 0; i1 < srPage.length; ++i1) {
            sum += (srPage[i1] & 0xFF);
        }
        return sum;
    }
    
    public static byte[] a(final long s) {
        final byte[] targets = { (byte)(s >> 8 & 0xFFL), (byte)(s & 0xFFL) };
        return targets;
    }
    
    public static long f(final byte[] bytes, final int pos, final int len) {
        final byte[] temp = new byte[len];
        System.arraycopy(bytes, pos, temp, 0, len);
        long val = 0L;
        for (int i = 0; i < len; ++i) {
            val <<= 8;
            val |= (temp[i] & 0xFF);
        }
        return val;
    }
    
    public static String b(long n) {
        StringBuffer s = new StringBuffer();
        final char[] b = { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F' };
        while (n != 0L) {
            s = s.append(b[(int)(n % 16L)]);
            n /= 16L;
        }
        final int su = s.toString().length();
        String a;
        if (su == 1) {
            a = "0" + s.reverse().toString();
        }
        else {
            a = s.reverse().toString();
        }
        return a;
    }
    
    public static byte n(final String src) {
        byte ret = 0;
        final byte[] tmp = src.getBytes();
        for (int i = 0; i < src.length() / 2; ++i) {
            ret = a(tmp[i * 2], tmp[i * 2 + 1]);
        }
        return ret;
    }
    
    public static int g(final byte[] bytes, final int pos, final int len) {
        final byte[] temp = new byte[len];
        System.arraycopy(bytes, pos, temp, 0, len);
        long val = 0L;
        for (int i = len; i > 0; --i) {
            val <<= 8;
            val |= (temp[i - 1] & 0xFF);
        }
        return (int)val;
    }
    
    public static String C(final byte[] bytes) {
        String version = "";
        for (int i = 0; i < bytes.length; ++i) {
            final int sum = bytes[i] & 0xFF;
            if (sum < 10) {
                final String str = d(bytes[i]);
                version += str;
            }
            else {
                version += sum;
            }
        }
        return version;
    }
    
    public static String d(final byte bArray) {
        final StringBuffer sb = new StringBuffer(1);
        final String sTemp = Integer.toHexString(0xFF & bArray);
        if (sTemp.length() < 2) {
            sb.append(0);
        }
        sb.append(sTemp.toUpperCase());
        return sb.toString();
    }
    
    static {
        d.m = "0123456789abcdef";
        d.n = new HashMap<String, Double>();
        d.o = new HashMap<String, Double>();
        d.p = new HashMap<String, Double>();
        d.q = new HashMap<String, Long>();
    }
}
