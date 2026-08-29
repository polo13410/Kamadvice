package com.kamadvice.backend.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * The recipe producing a given {@link Item} for a given
 * {@link Profession}, at a given level. The ingredients are the
 * associated {@link RecipeIngredient} rows.
 */
@Entity
@Table(name = "recipe")
public class Recipe {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "profession_id")
    private Profession profession;

    @ManyToOne(optional = false)
    @JoinColumn(name = "result_item_id")
    private Item resultItem;

    private Integer level;

    protected Recipe() {
        // JPA
    }

    public Recipe(Profession profession, Item resultItem, Integer level) {
        this.profession = profession;
        this.resultItem = resultItem;
        this.level = level;
    }

    public Long getId() {
        return id;
    }

    public Profession getProfession() {
        return profession;
    }

    public Item getResultItem() {
        return resultItem;
    }

    public Integer getLevel() {
        return level;
    }

    public void setLevel(Integer level) {
        this.level = level;
    }
}
