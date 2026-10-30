package edu.klh.lostfound;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@SpringBootApplication
@RestController
@RequestMapping("/api/verification")
public class VerificationApplication {

    private final Map<String, Map<String, Object>> verifiedClaims = new ConcurrentHashMap<>();

    public static void main(String[] args) {
        SpringApplication.run(VerificationApplication.class, args);
    }

    @GetMapping("/health")
    public Map<String, String> health() {
        Map<String, String> status = new HashMap<>();
        status.put("status", "ok");
        status.put("campus", "KLH University");
        return status;
    }

    @PostMapping("/roll-check")
    public Map<String, Object> validateRollNumber(@RequestBody Map<String, String> body) {
        String roll = Optional.ofNullable(body.get("rollNumber")).orElse("").trim().toUpperCase();
        boolean valid = roll.matches("^(2[0-9]{9}|STAFF-[A-Z0-9]+)$");
        Map<String, Object> result = new HashMap<>();
        result.put("rollNumber", roll);
        result.put("validCampusId", valid);
        result.put("checkedAt", Instant.now().toString());
        return result;
    }

    @KafkaListener(topics = "campus.claim.approved", groupId = "klh-desk-verification")
    public void onClaimApproved(String message) {
        Map<String, Object> record = new HashMap<>();
        record.put("rawEvent", message);
        record.put("receivedAt", Instant.now().toString());
        verifiedClaims.put(UUID.randomUUID().toString(), record);
    }

    @GetMapping("/ledger")
    public Collection<Map<String, Object>> ledger() {
        return verifiedClaims.values();
    }
}
